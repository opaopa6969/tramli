//! Regression tests for issue #152: `on_step_error` routes must be traversed by the
//! reachability, path-to-terminal and requires/produces checks, exactly like the
//! `on_error` fallback (guard produces available, processor produces not).

use std::any::TypeId;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    A,
    B,
    X,
    Recover,
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
        &[Self::A, Self::B, Self::X, Self::Recover, Self::Done]
    }
}

#[derive(Clone)]
struct P;

struct Proc {
    name: &'static str,
    requires: Vec<TypeId>,
    produces: Vec<TypeId>,
}
impl StateProcessor<S> for Proc {
    fn name(&self) -> &str {
        self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
    }
    fn produces(&self) -> Vec<TypeId> {
        self.produces.clone()
    }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

fn proc(name: &'static str, requires: Vec<TypeId>, produces: Vec<TypeId>) -> Proc {
    Proc {
        name,
        requires,
        produces,
    }
}

fn is_boom(e: &FlowError) -> bool {
    e.code == "BOOM"
}

#[test]
fn rejects_requires_that_the_exception_path_cannot_satisfy() {
    // Normal path A -> B -> X carries P, but a failure at A routes straight to X without P.
    let result = Builder::<S>::new("ex-route")
        .from(S::A)
        .auto(S::B, proc("makeP", vec![], requires![P]))
        .from(S::B)
        .auto(S::X, proc("toX", vec![], vec![]))
        .from(S::X)
        .auto(S::Done, proc("needsP", requires![P], vec![]))
        .from(S::Recover)
        .auto(S::Done, proc("unused", vec![], vec![]))
        .on_step_error(S::A, is_boom, "Boom", S::X)
        .on_step_error(S::B, is_boom, "Boom", S::Recover)
        .build_and_validate();
    assert!(result.definition.is_none());
    assert!(
        result
            .errors
            .iter()
            .any(|e| e.message.contains("Processor 'needsP' at X")),
        "errors: {:?}",
        result.errors.iter().map(|e| &e.message).collect::<Vec<_>>()
    );
}

#[test]
fn state_reachable_only_through_an_exception_route_is_reachable() {
    let def = Builder::<S>::new("ex-only")
        .from(S::A)
        .auto(S::B, proc("step", vec![], vec![]))
        .from(S::B)
        .auto(S::X, proc("toX", vec![], vec![]))
        .from(S::X)
        .auto(S::Done, proc("finish", vec![], vec![]))
        .from(S::Recover)
        .auto(S::Done, proc("recover", vec![], vec![]))
        .on_step_error(S::A, is_boom, "Boom", S::Recover)
        .build();
    assert!(def.is_ok(), "build failed: {:?}", def.err());
}

#[test]
fn data_available_before_the_failing_step_reaches_the_exception_route() {
    let result = Builder::<S>::new("ex-route-ok")
        .initially_available(requires![P])
        .from(S::A)
        .auto(S::B, proc("step", vec![], vec![]))
        .from(S::B)
        .auto(S::X, proc("toX", vec![], vec![]))
        .from(S::X)
        .auto(S::Done, proc("needsP", requires![P], vec![]))
        .from(S::Recover)
        .auto(S::Done, proc("recover", requires![P], vec![]))
        .on_step_error(S::A, is_boom, "Boom", S::Recover)
        .build_and_validate();
    assert!(
        result.definition.is_some(),
        "errors: {:?}",
        result.errors.iter().map(|e| &e.message).collect::<Vec<_>>()
    );
}
