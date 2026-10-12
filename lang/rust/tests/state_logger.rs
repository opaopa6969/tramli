use std::any::TypeId;
use std::sync::{Arc, Mutex};
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    Init,
    Done,
    Error,
}
impl FlowState for S {
    fn is_initial(&self) -> bool {
        *self == Self::Init
    }
    fn is_terminal(&self) -> bool {
        *self != Self::Init
    }
    fn all_states() -> &'static [Self] {
        &[Self::Init, Self::Done, Self::Error]
    }
}
struct Put(bool);
impl StateProcessor<S> for Put {
    fn name(&self) -> &str {
        "Put"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put("intermediate".to_string());
        ctx.put("final".to_string());
        ctx.put(7u32);
        if self.0 {
            Err(FlowError::new("FAILED", "failed"))
        } else {
            Ok(())
        }
    }
}
struct Choose;
impl BranchProcessor<S> for Choose {
    fn name(&self) -> &str {
        "Choose"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn decide(&self, _: &FlowContext) -> String {
        "run".into()
    }
}
struct Accept;
impl TransitionGuard<S> for Accept {
    fn name(&self) -> &str {
        "Accept"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn validate(&self, _: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: [(TypeId::of::<i32>(), Box::new(5i32) as Box<dyn CloneAny>)]
                .into_iter()
                .collect(),
        }
    }
}
fn definition(mode: &str, fail: bool) -> Arc<FlowDefinition<S>> {
    let b = Builder::new("state-logger")
        .on_error(S::Init, S::Error)
        .on_state_exit(S::Init, |ctx| ctx.put(1i16))
        .on_state_enter(S::Done, |ctx| ctx.put(2i16));
    let mut def = match mode {
        "auto" => b.from(S::Init).auto(S::Done, Put(fail)).build().unwrap(),
        "branch" => b
            .from(S::Init)
            .branch(Choose)
            .to(S::Done, "skip")
            .to(S::Done, "run")
            .end_branch()
            .build()
            .unwrap(),
        _ => b
            .from(S::Init)
            .external_with_processor(S::Done, Accept, Put(fail))
            .build()
            .unwrap(),
    };
    if mode == "branch" {
        def.transitions
            .iter_mut()
            .find(|t| t.branch_label.as_deref() == Some("run"))
            .unwrap()
            .processor = Some(Arc::new(Put(fail)));
    }
    Arc::new(def)
}
#[test]
fn successful_processors_log_final_added_and_replaced_values() {
    for mode in ["auto", "branch", "external"] {
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let entries = Arc::new(Mutex::new(Vec::new()));
        let captured = entries.clone();
        engine.set_state_logger(move |e| {
            captured.lock().unwrap().push((
                e.flow_id.clone(),
                e.flow_name.clone(),
                e.state.clone(),
                e.key.clone(),
                e.value.clone(),
            ))
        });
        let id = engine
            .start_flow(
                definition(mode, false),
                "test",
                vec![(TypeId::of::<String>(), Box::new("original".to_string()))],
            )
            .unwrap();
        if mode == "external" {
            assert!(entries.lock().unwrap().is_empty());
            engine.resume_and_execute(&id, vec![]).unwrap();
        }
        assert_eq!(engine.store.get(&id).unwrap().current_state(), S::Done);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 2, "{mode}");
        for e in entries.iter() {
            assert_eq!(
                (&e.0, e.1.as_str(), e.2.as_str()),
                (&id, "state-logger", "Init")
            );
        }
        assert!(entries
            .iter()
            .any(|e| e.3 == std::any::type_name::<String>() && e.4 == "final"));
        assert!(entries.iter().any(|e| e.3 == "u32" && e.4 == "7"));
    }
}
#[test]
fn failed_processors_restore_without_logging() {
    for mode in ["auto", "branch", "external"] {
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let entries = Arc::new(Mutex::new(0));
        let captured = entries.clone();
        engine.set_state_logger(move |_| *captured.lock().unwrap() += 1);
        let id = engine
            .start_flow(
                definition(mode, true),
                "test",
                vec![(TypeId::of::<String>(), Box::new("original".to_string()))],
            )
            .unwrap();
        if mode == "external" {
            engine.resume_and_execute(&id, vec![]).unwrap();
        }
        let flow = engine.store.get(&id).unwrap();
        assert_eq!(flow.current_state(), S::Error);
        assert_eq!(*entries.lock().unwrap(), 0);
        assert_eq!(flow.context.get::<String>().unwrap(), "original");
        assert!(!flow.context.has::<u32>());
    }
}
#[test]
fn removed_logger_is_not_called() {
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    engine.set_state_logger(|_| panic!("logger removed"));
    engine.remove_all_loggers();
    let id = engine
        .start_flow(definition("auto", false), "test", vec![])
        .unwrap();
    let flow = engine.store.get(&id).unwrap();
    assert_eq!(flow.current_state(), S::Done);
    assert_eq!(*flow.context.get::<u32>().unwrap(), 7);
}

#[test]
fn produces_violation_does_not_log() {
    struct MissingOutput;
    impl StateProcessor<S> for MissingOutput {
        fn name(&self) -> &str {
            "MissingOutput"
        }
        fn requires(&self) -> Vec<TypeId> {
            vec![]
        }
        fn produces(&self) -> Vec<TypeId> {
            vec![TypeId::of::<u32>()]
        }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put("dirty".to_string());
            Ok(())
        }
    }
    let mut engine = FlowEngine::with_strict_mode(InMemoryFlowStore::new());
    engine.set_state_logger(|_| panic!("failed validation must not log"));
    let def = Builder::new("strict-logger")
        .from(S::Init)
        .auto(S::Done, MissingOutput)
        .on_error(S::Init, S::Error)
        .build()
        .unwrap();
    let id = engine.start_flow(Arc::new(def), "test", vec![]).unwrap();
    let flow = engine.store.get(&id).unwrap();
    assert_eq!(flow.current_state(), S::Error);
    assert!(!flow.context.has::<String>());
}

#[test]
fn zero_sized_opaque_values_are_logged_once_on_replacement() {
    #[derive(Clone)]
    struct Opaque;
    struct PutOpaque;
    impl StateProcessor<S> for PutOpaque {
        fn name(&self) -> &str {
            "PutOpaque"
        }
        fn requires(&self) -> Vec<TypeId> {
            vec![]
        }
        fn produces(&self) -> Vec<TypeId> {
            vec![]
        }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(Opaque);
            ctx.put(Opaque);
            Ok(())
        }
    }
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let entries = Arc::new(Mutex::new(Vec::new()));
    let captured = entries.clone();
    engine.set_state_logger(move |e| {
        captured
            .lock()
            .unwrap()
            .push((e.key.clone(), e.value.clone()))
    });
    let def = Builder::new("opaque-logger")
        .from(S::Init)
        .auto(S::Done, PutOpaque)
        .build()
        .unwrap();
    engine
        .start_flow(
            Arc::new(def),
            "test",
            vec![(TypeId::of::<Opaque>(), Box::new(Opaque))],
        )
        .unwrap();
    let name = std::any::type_name::<Opaque>();
    assert_eq!(
        *entries.lock().unwrap(),
        vec![(name.to_string(), format!("<opaque: {name}>"))]
    );
}
