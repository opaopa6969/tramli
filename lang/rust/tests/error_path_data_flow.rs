//! Regression tests for issue #157: any step leaving a state can fail (processor or
//! branch error, guard retries exhausted), and the engine restores the context to
//! what it was before the guard ran. Error targets must therefore be checked with
//! exactly the guaranteed set of the failing state.

use std::any::TypeId;
use std::collections::HashMap;
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
struct P;
#[derive(Clone)]
struct G;

struct Proc {
    name: &'static str,
    requires: Vec<TypeId>,
}
impl StateProcessor<S> for Proc {
    fn name(&self) -> &str {
        self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

fn proc(name: &'static str, requires: Vec<TypeId>) -> Proc {
    Proc { name, requires }
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
        "b".into()
    }
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

fn assert_rejected_at_e(result: BuildResult<S>, processor: &str) {
    assert!(result.definition.is_none());
    let needle = format!("Processor '{}' at E", processor);
    assert!(
        result.errors.iter().any(|e| e.message.contains(&needle)),
        "errors: {:?}",
        result.errors.iter().map(|e| &e.message).collect::<Vec<_>>()
    );
}

#[test]
fn checks_the_error_target_of_a_state_with_only_a_branch() {
    let result = Builder::<S>::new("branch-error")
        .from(S::A)
        .branch(Route)
        .to(S::B, "b")
        .to(S::Done, "d")
        .end_branch()
        .from(S::B)
        .auto(S::Done, proc("fine", vec![]))
        .from(S::E)
        .auto(S::Done, proc("needsP", requires![P]))
        .on_error(S::A, S::E)
        .build_and_validate();
    assert_rejected_at_e(result, "needsP");
}

#[test]
fn guard_produces_are_not_available_on_the_error_path() {
    let result = Builder::<S>::new("guard-error")
        .from(S::A)
        .external_with_processor(S::B, Guard, proc("step", vec![]))
        .from(S::B)
        .auto(S::Done, proc("fine", vec![]))
        .from(S::E)
        .auto(S::Done, proc("needsG", requires![G]))
        .on_error(S::A, S::E)
        .build_and_validate();
    assert_rejected_at_e(result, "needsG");
}
