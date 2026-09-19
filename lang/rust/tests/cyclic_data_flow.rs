//! Regression tests for issue #114: requires/produces validation must terminate on
//! cyclic flows where a revisit brings a strict superset of the guaranteed set.
//!
//! Shape: START branches to two paths that join at B with partially overlapping data
//! (shrinking B's guaranteed set), and B <-> A form an external/auto cycle whose
//! transitions keep adding data. The Rust traversal already stopped when the
//! intersection left the set unchanged; this pins that behavior alongside the
//! TypeScript/Java fixes.

use std::any::TypeId;
use std::collections::HashMap;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    Start,
    A0,
    C0,
    A,
    C,
    B,
    Done,
}
impl FlowState for S {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::Start)
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::Start,
            Self::A0,
            Self::C0,
            Self::A,
            Self::C,
            Self::B,
            Self::Done,
        ]
    }
}

#[derive(Clone)]
struct X;
#[derive(Clone)]
struct W;
#[derive(Clone)]
struct Y;
#[derive(Clone)]
struct Z;

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
    requires: Vec<TypeId>,
    produces: Vec<TypeId>,
}
impl TransitionGuard<S> for Guard {
    fn name(&self) -> &str {
        self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
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

struct Route;
impl BranchProcessor<S> for Route {
    fn name(&self) -> &str {
        "route"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn decide(&self, _ctx: &FlowContext) -> String {
        "a".into()
    }
}

fn cyclic_flow(done_requires: Vec<TypeId>) -> Builder<S> {
    Builder::<S>::new("cyclic-join")
        .from(S::Start)
        .branch(Route)
        .to(S::A0, "a")
        .to(S::C0, "c")
        .end_branch()
        .from(S::A0)
        .auto(
            S::A,
            Proc {
                name: "initA",
                produces: requires![X],
            },
        )
        .from(S::C0)
        .auto(
            S::C,
            Proc {
                name: "initC",
                produces: requires![X, W],
            },
        )
        .from(S::C)
        .auto(
            S::B,
            Proc {
                name: "join",
                produces: vec![],
            },
        )
        .from(S::A)
        .auto(
            S::B,
            Proc {
                name: "toB",
                produces: requires![Y],
            },
        )
        .from(S::B)
        .external(
            S::A,
            Guard {
                name: "backGuard",
                requires: vec![],
                produces: requires![Z],
            },
        )
        .from(S::B)
        .external(
            S::Done,
            Guard {
                name: "doneGuard",
                requires: done_requires,
                produces: vec![],
            },
        )
}

#[test]
fn builds_when_guaranteed_set_stops_changing_on_revisit() {
    let def = cyclic_flow(requires![X])
        .build()
        .expect("cyclic join flow should build");
    // Guaranteed set at B is the intersection of both incoming paths.
    let expected: std::collections::HashSet<TypeId> = requires![X].into_iter().collect();
    assert_eq!(def.data_flow_graph().available_at(S::B), expected);
}

#[test]
fn still_reports_requires_that_only_one_join_path_satisfies() {
    let result = cyclic_flow(requires![Y]).build_and_validate();
    assert!(result.definition.is_none());
    assert!(
        result.errors.iter().any(|e| e
            .message
            .contains("Guard 'doneGuard' at B requires a type that may not be available")),
        "errors: {:?}",
        result.errors.iter().map(|e| &e.message).collect::<Vec<_>>()
    );
}
