//! Regression tests for issue #155: when a join state is revisited with a narrower
//! available set, the guaranteed set must shrink and downstream requires must be
//! re-checked, regardless of which incoming path is traversed first.

use std::any::TypeId;
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

fn join(rich_path_first: bool) -> BuildResult<S> {
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
                requires: vec![],
                produces: requires![P],
            },
        )
        .from(S::J)
        .auto(
            S::Done,
            Proc {
                name: "needsP",
                requires: requires![P],
                produces: vec![],
            },
        )
        .build_and_validate()
}

fn assert_rejected(result: BuildResult<S>) {
    assert!(result.definition.is_none());
    assert!(
        result
            .errors
            .iter()
            .any(|e| e.message.contains("Processor 'needsP' at J")),
        "errors: {:?}",
        result.errors.iter().map(|e| &e.message).collect::<Vec<_>>()
    );
}

#[test]
fn rejects_when_the_narrower_path_arrives_second() {
    assert_rejected(join(true));
}

#[test]
fn rejects_when_the_narrower_path_arrives_first() {
    assert_rejected(join(false));
}
