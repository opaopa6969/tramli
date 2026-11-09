use std::any::TypeId;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    Wait,
    Next,
    Done,
    TypedError,
    Error,
}

impl FlowState for S {
    fn is_initial(&self) -> bool {
        *self == Self::Wait
    }
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done | Self::TypedError | Self::Error)
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::Wait,
            Self::Next,
            Self::Done,
            Self::TypedError,
            Self::Error,
        ]
    }
}

struct Produce {
    calls: Arc<AtomicUsize>,
    failure: Option<&'static str>,
}

impl StateProcessor<S> for Produce {
    fn name(&self) -> &str {
        "produce"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![TypeId::of::<String>()]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![TypeId::of::<u32>()]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        assert_eq!(ctx.get::<String>()?, "external");
        ctx.put(42u32);
        if let Some(code) = self.failure {
            ctx.put("dirty".to_string());
            return Err(FlowError::new(code, "processor failed"));
        }
        Ok(())
    }
}

struct Consume(Arc<AtomicUsize>);
impl StateProcessor<S> for Consume {
    fn name(&self) -> &str {
        "consume"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![TypeId::of::<u32>()]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        self.0.store(*ctx.get::<u32>()? as usize, Ordering::SeqCst);
        Ok(())
    }
}

#[test]
fn runs_processor_before_downstream_consumer() {
    let calls = Arc::new(AtomicUsize::new(0));
    let consumed = Arc::new(AtomicUsize::new(0));
    let mut def = Builder::new("unguarded-success")
        .allow_unreachable()
        .initially_available(vec![TypeId::of::<String>()])
        .from(S::Wait)
        .auto(
            S::Next,
            Produce {
                calls: calls.clone(),
                failure: None,
            },
        )
        .from(S::Next)
        .auto(S::Done, Consume(consumed.clone()))
        .build()
        .unwrap();
    // The fluent external builder requires a guard, but public transitions do not.
    def.transitions[0].transition_type = TransitionType::External;
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let id = engine.start_flow(Arc::new(def), "session", vec![]).unwrap();
    assert_eq!(engine.store.get(&id).unwrap().current_state(), S::Wait);
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    engine
        .resume_and_execute(
            &id,
            vec![(TypeId::of::<String>(), Box::new("external".to_string()))],
        )
        .unwrap();

    let flow = engine.store.get(&id).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert_eq!(consumed.load(Ordering::SeqCst), 42);
    assert_eq!(*flow.context.get::<u32>().unwrap(), 42);
    assert_eq!(flow.current_state(), S::Done);
    assert!(flow.is_completed());
    assert!(flow.last_error().is_none());
}

#[test]
fn failure_restores_context_and_uses_on_step_error() {
    assert_failure_route("TYPED", S::TypedError);
}

#[test]
fn unmatched_failure_restores_context_and_falls_back_to_on_error() {
    assert_failure_route("OTHER", S::Error);
}

fn assert_failure_route(code: &'static str, target: S) {
    let calls = Arc::new(AtomicUsize::new(0));
    let mut def = Builder::new("unguarded-failure")
        .allow_unreachable()
        .initially_available(vec![TypeId::of::<String>()])
        .from(S::Wait)
        .auto(
            S::Done,
            Produce {
                calls: calls.clone(),
                failure: Some(code),
            },
        )
        .on_step_error(S::Wait, |e| e.code == "TYPED", "typed", S::TypedError)
        .on_error(S::Wait, S::Error)
        .build()
        .unwrap();
    def.transitions[0].transition_type = TransitionType::External;
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let id = engine
        .start_flow(
            Arc::new(def),
            "session",
            vec![(TypeId::of::<String>(), Box::new("initial".to_string()))],
        )
        .unwrap();

    engine
        .resume_and_execute(
            &id,
            vec![
                (TypeId::of::<String>(), Box::new("external".to_string())),
                (TypeId::of::<bool>(), Box::new(true)),
            ],
        )
        .unwrap();

    let flow = engine.store.get(&id).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert_eq!(flow.current_state(), target);
    assert!(flow.is_completed());
    assert_eq!(flow.context.get::<String>().unwrap(), "external");
    assert!(*flow.context.get::<bool>().unwrap());
    assert!(!flow.context.has::<u32>());
    assert!(flow.last_error().unwrap().contains("processor failed"));
}
