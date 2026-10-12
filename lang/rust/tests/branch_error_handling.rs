use std::any::TypeId;
use std::sync::Arc;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    Start,
    Done,
    GenericError,
    SpecificError,
}
impl FlowState for S {
    fn is_initial(&self) -> bool {
        *self == Self::Start
    }
    fn is_terminal(&self) -> bool {
        *self != Self::Start
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::Start,
            Self::Done,
            Self::GenericError,
            Self::SpecificError,
        ]
    }
}

struct Choose(&'static str);
impl BranchProcessor<S> for Choose {
    fn name(&self) -> &str {
        "Choose"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn decide(&self, _ctx: &FlowContext) -> String {
        self.0.into()
    }
}

#[derive(Clone, Debug, PartialEq)]
struct ExistingData(&'static str);
#[derive(Clone)]
struct TemporaryData;
struct Fail;
impl StateProcessor<S> for Fail {
    fn name(&self) -> &str {
        "Fail"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(ExistingData("changed"));
        ctx.put(TemporaryData);
        Err(FlowError::new("PROC_ERROR", "branch processor failed"))
    }
}

fn definition(label: &'static str, specific_route: bool, code: &'static str) -> FlowDefinition<S> {
    let mut builder = Builder::new("branch-errors")
        .from(S::Start)
        .branch(Choose(label))
        // Both labels share a target: select the processor by label.
        .to(S::Done, "skip")
        .to(S::Done, "run")
        .end_branch()
        .on_error(S::Start, S::GenericError);
    if specific_route {
        builder = builder.on_step_error(S::Start, move |e| e.code == code, code, S::SpecificError);
    }
    let mut def = builder.build().unwrap();
    // BranchBuilder does not expose label-specific processors.
    def.transitions
        .iter_mut()
        .find(|t| t.branch_label.as_deref() == Some("run"))
        .unwrap()
        .processor = Some(Arc::new(Fail));
    def
}

fn assert_error_record(engine: &FlowEngine<S, InMemoryFlowStore<S>>, expected: S) {
    let records = engine.store.transition_log();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].from, "Start");
    assert_eq!(records[0].to, format!("{expected:?}"));
    assert_eq!(records[0].trigger, "error");
}

#[test]
fn branch_processor_failure_restores_context_and_routes_error() {
    for specific_route in [false, true] {
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine
            .start_flow(
                Arc::new(definition("run", specific_route, "PROC_ERROR")),
                "test",
                vec![(
                    TypeId::of::<ExistingData>(),
                    Box::new(ExistingData("original")),
                )],
            )
            .expect("processor failure must be handled by the error route");
        let flow = engine.store.get(&fid).unwrap();
        let expected = if specific_route {
            S::SpecificError
        } else {
            S::GenericError
        };
        assert_eq!(flow.current_state(), expected);
        assert!(flow.is_completed());
        assert_eq!(
            flow.context.get::<ExistingData>().unwrap(),
            &ExistingData("original")
        );
        assert!(!flow.context.has::<TemporaryData>());
        assert_eq!(
            flow.last_error(),
            Some("[PROC_ERROR] branch processor failed")
        );
        assert_error_record(&engine, expected);
    }
}

#[test]
fn unknown_branch_label_records_cause_and_routes_error() {
    for specific_route in [false, true] {
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine
            .start_flow(
                Arc::new(definition("missing", specific_route, "UNKNOWN_BRANCH")),
                "test",
                vec![],
            )
            .expect("unknown labels must be handled by the error route");
        let flow = engine.store.get(&fid).unwrap();
        let expected = if specific_route {
            S::SpecificError
        } else {
            S::GenericError
        };
        assert_eq!(
            flow.last_error(),
            Some("[UNKNOWN_BRANCH] Branch 'Choose' returned unknown label: missing")
        );
        assert_eq!(flow.current_state(), expected);
        assert!(flow.is_completed());
        assert_error_record(&engine, expected);
    }
}

#[test]
fn successful_branch_does_not_run_another_labels_processor() {
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine
        .start_flow(
            Arc::new(definition("skip", false, "PROC_ERROR")),
            "test",
            vec![],
        )
        .unwrap();
    let flow = engine.store.get(&fid).unwrap();
    assert_eq!(flow.current_state(), S::Done);
    assert_eq!(flow.last_error(), None);
    assert!(!flow.context.has::<TemporaryData>());
    assert_eq!(engine.store.transition_log()[0].trigger, "Choose:skip");
}
