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

struct Accept;
impl TransitionGuard<S> for Accept {
    fn name(&self) -> &str {
        "accept"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![TypeId::of::<i32>()]
    }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: std::collections::HashMap::from([(
                TypeId::of::<i32>(),
                Box::new(7i32) as Box<dyn CloneAny>,
            )]),
        }
    }
}

fn parent(child: FlowDefinition<S>) -> Arc<FlowDefinition<S>> {
    Arc::new(
        Builder::new("parent")
            .allow_unreachable()
            .from(S::Wait)
            .sub_flow(Box::new(tramli::sub_flow::SubFlowAdapter::new(Arc::new(
                child,
            ))))
            .on_exit("Done", S::Done)
            .on_exit("TypedError", S::TypedError)
            .on_exit("Error", S::Error)
            .end_sub_flow()
            .on_error(S::Wait, S::Error)
            .build()
            .unwrap(),
    )
}

struct Produce {
    guarded: bool,
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
        assert_eq!(ctx.has::<i32>(), self.guarded);
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
fn guarded_runs_processor_before_downstream_consumer() {
    assert_success(true);
}
#[test]
fn unguarded_runs_processor_before_downstream_consumer() {
    assert_success(false);
}
fn assert_success(guarded: bool) {
    let calls = Arc::new(AtomicUsize::new(0));
    let consumed = Arc::new(AtomicUsize::new(0));
    let mut def = Builder::new("child-success")
        .allow_unreachable()
        .initially_available(vec![TypeId::of::<String>()])
        .from(S::Wait)
        .external_with_processor(
            S::Next,
            Accept,
            Produce {
                guarded,
                calls: calls.clone(),
                failure: None,
            },
        )
        .from(S::Next)
        .auto(S::Done, Consume(consumed.clone()))
        .build()
        .unwrap();
    // The fluent external builder requires a guard, but public transitions do not.
    if !guarded {
        def.transitions[0].guard = None;
    }
    let def = parent(def);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let logged = Arc::new(AtomicUsize::new(0));
    let captured = logged.clone();
    engine.set_state_logger(move |entry| {
        assert_eq!(entry.flow_name, "child-success");
        assert_eq!(entry.state, "Wait");
        assert_eq!(entry.key, "u32");
        assert_eq!(entry.value, "42");
        captured.fetch_add(1, Ordering::SeqCst);
    });
    let id = engine.start_flow(def, "session", vec![]).unwrap();
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
    assert_eq!(logged.load(Ordering::SeqCst), 1);
    assert_eq!(*flow.context.get::<u32>().unwrap(), 42);
    assert_eq!(flow.current_state(), S::Done);
    assert!(flow.is_completed());
    assert!(flow.last_error().is_none());
}

#[test]
fn failure_restores_context_and_uses_on_step_error() {
    assert_failure_route("TYPED", S::TypedError, true);
}

#[test]
fn unmatched_failure_restores_context_and_falls_back_to_on_error() {
    assert_failure_route("OTHER", S::Error, true);
}

#[test]
fn unguarded_failure_restores_context_and_uses_on_step_error() {
    assert_failure_route("TYPED", S::TypedError, false);
}
#[test]
fn unguarded_unmatched_failure_restores_context_and_falls_back_to_on_error() {
    assert_failure_route("OTHER", S::Error, false);
}
#[test]
fn unhandled_failure_bubbles_to_parent() {
    assert_failure_route("UNHANDLED", S::Error, true);
}
#[test]
fn unguarded_unhandled_failure_bubbles_to_parent() {
    assert_failure_route("UNHANDLED", S::Error, false);
}
fn assert_failure_route(code: &'static str, target: S, guarded: bool) {
    let calls = Arc::new(AtomicUsize::new(0));
    let mut def = Builder::new("child-failure")
        .allow_unreachable()
        .initially_available(vec![TypeId::of::<String>()])
        .from(S::Wait)
        .external_with_processor(
            S::Done,
            Accept,
            Produce {
                guarded,
                calls: calls.clone(),
                failure: Some(code),
            },
        )
        .on_step_error(S::Wait, |e| e.code == "TYPED", "typed", S::TypedError)
        .on_error(S::Wait, S::Error)
        .build()
        .unwrap();
    if !guarded {
        def.transitions[0].guard = None;
    }
    if code == "UNHANDLED" {
        def.exception_routes.clear();
        def.error_transitions.clear();
    }
    let def = parent(def);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let id = engine
        .start_flow(
            def,
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
    assert!(!flow.context.has::<i32>());
    assert!(!flow.has_active_sub_flow());
}
