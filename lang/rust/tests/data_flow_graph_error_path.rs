//! Regression tests for issue #170: DataFlowGraph follows error routes like the
//! build() requires/produces check (issues #152 and #157). A step leaving a
//! non-terminal state can fail, the engine restores the context, and every
//! on_step_error / on_error target receives exactly the guaranteed set of that state.

use std::any::TypeId;
use std::collections::{HashMap, HashSet};
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    A,
    B,
    E,
    Done,
}
impl FlowState for S {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::A)
    }
    fn all_states() -> &'static [Self] {
        &[Self::A, Self::B, Self::E, Self::Done]
    }
}

#[derive(Clone)]
struct I;
#[derive(Clone)]
struct P;
#[derive(Clone)]
struct G;

struct Proc {
    name: &'static str,
    produces: Vec<TypeId>,
}
impl StateProcessor<S> for Proc {
    fn name(&self) -> &str {
        self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        self.produces.clone()
    }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

fn proc(name: &'static str, produces: Vec<TypeId>) -> Proc {
    Proc { name, produces }
}

struct Guard;
impl TransitionGuard<S> for Guard {
    fn name(&self) -> &str {
        "guard"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        requires![G]
    }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: HashMap::new(),
        }
    }
}

fn set(types: Vec<TypeId>) -> HashSet<TypeId> {
    types.into_iter().collect()
}

#[test]
fn intersects_a_join_reached_by_an_error_route() {
    for exception_route in [false, true] {
        // A -> E produces P; the error route A -> E carries only A's guaranteed set.
        let b = Builder::<S>::new("error-join")
            .allow_unreachable() // B is not used
            .from(S::A)
            .auto(S::E, proc("makeP", requires![P]))
            .from(S::E)
            .auto(S::Done, proc("finish", vec![]));
        let b = if exception_route {
            b.on_step_error(S::A, |_| true, "any", S::E)
        } else {
            b.on_error(S::A, S::E)
        };
        let def = b.build().expect("error join should build");
        let graph = def.data_flow_graph();
        for state in [S::E, S::Done] {
            assert_eq!(
                graph.available_at(state),
                HashSet::new(),
                "{state:?}, exception route: {exception_route}"
            );
        }
    }
}

#[test]
fn tracks_a_state_reached_only_through_an_exception_route() {
    let def = Builder::<S>::new("step-error-reach")
        .allow_unreachable() // B is not used
        .initially_available(requires![I])
        .from(S::A)
        .auto(S::Done, proc("work", requires![P]))
        .from(S::E)
        .auto(S::Done, proc("recover", vec![]))
        .on_step_error(S::A, |_| true, "any", S::E)
        .build()
        .expect("exception route flow should build");
    let graph = def.data_flow_graph();
    assert_eq!(graph.available_at(S::E), set(requires![I]));
    assert!(
        graph
            .generate_invariant_assertions()
            .iter()
            .any(|a| a.starts_with("At state E:")),
        "assertions: {:?}",
        graph.generate_invariant_assertions()
    );
}

#[test]
fn does_not_carry_guard_produces_onto_the_error_path() {
    let def = Builder::<S>::new("guard-error")
        .initially_available(requires![I])
        .from(S::A)
        .external_with_processor(S::B, Guard, proc("step", vec![]))
        .from(S::B)
        .auto(S::Done, proc("fine", vec![]))
        .from(S::E)
        .auto(S::Done, proc("recover", vec![]))
        .on_error(S::A, S::E)
        .build()
        .expect("guard error flow should build");
    let graph = def.data_flow_graph();
    assert_eq!(graph.available_at(S::B), set(requires![I, G]));
    assert_eq!(graph.available_at(S::E), set(requires![I]));
}
