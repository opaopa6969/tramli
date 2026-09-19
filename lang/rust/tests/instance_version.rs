use std::any::TypeId;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tramli::{Builder, FlowContext, FlowInstance, FlowState, GuardOutput, TransitionGuard};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum State {
    Waiting,
    Done,
}

impl FlowState for State {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done)
    }

    fn is_initial(&self) -> bool {
        matches!(self, Self::Waiting)
    }

    fn all_states() -> &'static [Self] {
        &[Self::Waiting, Self::Done]
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PersistedData(&'static str);

struct CompletionGuard;

impl TransitionGuard<State> for CompletionGuard {
    fn name(&self) -> &str {
        "CompletionGuard"
    }

    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }

    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }

    fn validate(&self, _context: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: Default::default(),
        }
    }
}

#[test]
fn set_version_preserves_flow_state_and_context() {
    let definition = Arc::new(
        Builder::<State>::new("persistent-flow")
            .ttl(Duration::from_secs(60))
            .from(State::Waiting)
            .external(State::Done, CompletionGuard)
            .build()
            .unwrap(),
    );
    let mut context = FlowContext::new("flow-1".to_string());
    context.put(PersistedData("keep me"));
    let expires_at = Instant::now() + Duration::from_secs(60);
    let mut flow = FlowInstance::new(
        "flow-1".to_string(),
        "session-1".to_string(),
        definition.clone(),
        context,
        State::Waiting,
        expires_at,
    );
    let created_at = flow.created_at;

    flow.set_version(7);

    assert_eq!(flow.version(), 7);
    assert_eq!(flow.current_state(), State::Waiting);
    assert_eq!(flow.context.get::<PersistedData>().unwrap().0, "keep me");
    assert!(Arc::ptr_eq(&flow.definition, &definition));
    assert_eq!(flow.created_at, created_at);
    assert_eq!(flow.expires_at, expires_at);
    assert!(!flow.is_completed());
}
