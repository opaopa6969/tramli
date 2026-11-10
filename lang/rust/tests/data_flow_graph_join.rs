//! Regression tests for issue #170: DataFlowGraph must compute the same guaranteed
//! sets as the build() requires/produces check. When a join state is revisited with
//! a narrower available set, available_at() must shrink, regardless of which
//! incoming path is traversed first, and traversal must still stop on cyclic flows.

use std::any::TypeId;
use std::collections::{HashMap, HashSet};
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    A,
    B,
    J,
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
        &[Self::A, Self::B, Self::J, Self::Done]
    }
}

#[derive(Clone)]
struct P;
#[derive(Clone)]
struct Q;
struct Direct;
struct Detour;
struct Return;
struct Finish;
struct ToB;
struct ToJ;
struct FromB;
struct Again;

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

struct Guard {
    name: &'static str,
    produces: Vec<TypeId>,
}
impl TransitionGuard<S> for Guard {
    fn name(&self) -> &str {
        self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        self.produces.clone()
    }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: HashMap::new(),
        }
    }
}

fn guard(name: &'static str, produces: Vec<TypeId>) -> Guard {
    Guard { name, produces }
}

struct Route;
impl BranchProcessor<S> for Route {
    fn name(&self) -> &str {
        "route"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn decide(&self, _ctx: &FlowContext) -> String {
        "j".into()
    }
}

fn set(types: Vec<TypeId>) -> HashSet<TypeId> {
    types.into_iter().collect()
}

fn branch_join(rich_path_first: bool) -> FlowDefinition<S> {
    let b = Builder::<S>::new("join").from(S::A).branch(Route);
    let branched = if rich_path_first {
        b.to(S::B, "b").to(S::J, "j")
    } else {
        b.to(S::J, "j").to(S::B, "b")
    };
    branched
        .end_branch()
        .from(S::B)
        .auto(
            S::J,
            Proc {
                name: "makeP",
                produces: requires![P],
            },
        )
        .from(S::J)
        .auto(
            S::Done,
            Proc {
                name: "finish",
                produces: vec![],
            },
        )
        .build()
        .expect("branch join should build")
}

fn external_join(rich_path_first: bool) -> FlowDefinition<S> {
    // Issue reproduction: A -> J produces P, A -> B -> J does not.
    let rich = |b: Builder<S>| {
        b.from(S::A)
            .external_on::<Direct>(S::J, guard("direct", requires![P]))
    };
    let poor = |b: Builder<S>| {
        b.from(S::A)
            .external_on::<Detour>(S::B, guard("detour", vec![]))
    };
    let b = Builder::<S>::new("external-join");
    let b = if rich_path_first {
        poor(rich(b))
    } else {
        rich(poor(b))
    };
    b.from(S::B)
        .external_on::<Return>(S::J, guard("return", vec![]))
        .from(S::J)
        .external_on::<Finish>(S::Done, guard("finish", vec![]))
        .build()
        .expect("external join should build")
}

#[test]
fn shrinks_available_at_at_a_branch_join() {
    for rich_path_first in [true, false] {
        let def = branch_join(rich_path_first);
        let graph = def.data_flow_graph();
        for state in [S::B, S::J, S::Done] {
            assert_eq!(
                graph.available_at(state),
                HashSet::new(),
                "{state:?}, rich path first: {rich_path_first}"
            );
        }
    }
}

#[test]
fn shrinks_available_at_at_an_external_join() {
    for rich_path_first in [true, false] {
        let def = external_join(rich_path_first);
        let graph = def.data_flow_graph();
        for state in [S::J, S::Done] {
            assert_eq!(
                graph.available_at(state),
                HashSet::new(),
                "{state:?}, rich path first: {rich_path_first}"
            );
        }
    }
}

#[test]
fn stops_on_a_produces_self_loop_and_still_shrinks_the_join() {
    // A -> B -> J carries P, A -> J carries nothing, and J loops on itself adding Q.
    let def = Builder::<S>::new("loop-join")
        .from(S::A)
        .external_on::<ToB>(S::B, guard("toB", requires![P]))
        .from(S::A)
        .external_on::<ToJ>(S::J, guard("toJ", vec![]))
        .from(S::B)
        .external_on::<FromB>(S::J, guard("fromB", vec![]))
        .from(S::J)
        .external_on::<Again>(S::J, guard("again", requires![Q]))
        .from(S::J)
        .external_on::<Finish>(S::Done, guard("finish", vec![]))
        .build()
        .expect("loop join should build");
    let graph = def.data_flow_graph();
    assert_eq!(graph.available_at(S::B), set(requires![P]));
    assert_eq!(graph.available_at(S::J), HashSet::new());
    assert_eq!(graph.available_at(S::Done), HashSet::new());
}
