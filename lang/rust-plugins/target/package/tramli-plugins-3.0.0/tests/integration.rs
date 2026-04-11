use std::any::TypeId;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use tramli::*;
use tramli_plugins::*;
use tramli_plugins::observability::TelemetrySink;

// ─── Shared test flow ──────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S { Created, Pending, Confirmed, Done, Error }

impl FlowState for S {
    fn is_terminal(&self) -> bool { matches!(self, Self::Done | Self::Error) }
    fn is_initial(&self) -> bool { matches!(self, Self::Created) }
    fn all_states() -> &'static [Self] { &[Self::Created, Self::Pending, Self::Confirmed, Self::Done, Self::Error] }
}

#[derive(Clone, Debug)] struct Input { value: String }
#[derive(Clone, Debug)] struct Middle { processed: bool }
#[derive(Clone, Debug)] struct Output { result: String }

struct Proc1;
impl StateProcessor<S> for Proc1 {
    fn name(&self) -> &str { "Proc1" }
    fn requires(&self) -> Vec<TypeId> { requires![Input] }
    fn produces(&self) -> Vec<TypeId> { requires![Middle] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(Middle { processed: true });
        Ok(())
    }
}

struct Proc2;
impl StateProcessor<S> for Proc2 {
    fn name(&self) -> &str { "Proc2" }
    fn requires(&self) -> Vec<TypeId> { requires![Middle] }
    fn produces(&self) -> Vec<TypeId> { requires![Output] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(Output { result: "done".into() });
        Ok(())
    }
}

struct TestGuard { accept: bool }
impl TransitionGuard<S> for TestGuard {
    fn name(&self) -> &str { "TestGuard" }
    fn requires(&self) -> Vec<TypeId> { requires![Middle] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        if self.accept {
            GuardOutput::Accepted { data: HashMap::new() }
        } else {
            GuardOutput::Rejected { reason: "declined".into() }
        }
    }
}

fn build_def(accept: bool) -> Arc<FlowDefinition<S>> {
    Arc::new(Builder::new("test")
        .ttl(Duration::from_secs(300))
        .initially_available(requires![Input])
        .from(S::Created).auto(S::Pending, Proc1)
        .from(S::Pending).external(S::Confirmed, TestGuard { accept })
        .from(S::Confirmed).auto(S::Done, Proc2)
        .on_any_error(S::Error)
        .build().unwrap())
}

fn initial_data() -> Vec<(TypeId, Box<dyn CloneAny>)> {
    vec![(TypeId::of::<Input>(), Box::new(Input { value: "test".into() }) as Box<dyn CloneAny>)]
}

// ─── Tests ─────────────────────────────────────────

#[test]
fn audit_store_captures_transitions() {
    let def = build_def(true);
    let mut store = audit::AuditingStore::<S>::new(InMemoryFlowStore::new());
    store.record_transition("f1", "CREATED", "PENDING", "Proc1");
    assert_eq!(store.audited_transitions().len(), 1);
    assert_eq!(store.audited_transitions()[0].from, "CREATED");
    assert_eq!(store.audited_transitions()[0].to, "PENDING");
}

#[test]
fn eventstore_replay() {
    let mut store = eventstore::EventLogStore::new(InMemoryFlowStore::<S>::new());
    store.record_transition("f1", "CREATED", "PENDING", "Proc1", "{}");
    store.record_transition("f1", "PENDING", "CONFIRMED", "TestGuard", "{}");
    store.record_transition("f1", "CONFIRMED", "DONE", "Proc2", "{}");

    let events = store.events();
    assert_eq!(events.len(), 3);

    let state = eventstore::ReplayService::state_at_version(events, "f1", 2);
    assert_eq!(state, Some("CONFIRMED".to_string()));

    let state_v1 = eventstore::ReplayService::state_at_version(events, "f1", 1);
    assert_eq!(state_v1, Some("PENDING".to_string()));
}

#[test]
fn projection_replay() {
    let mut store = eventstore::EventLogStore::new(InMemoryFlowStore::<S>::new());
    store.record_transition("f1", "A", "B", "t1", "{}");
    store.record_transition("f1", "B", "C", "t2", "{}");

    struct CountReducer;
    impl eventstore::ProjectionReducer<usize> for CountReducer {
        fn initial_state(&self) -> usize { 0 }
        fn apply(&self, state: usize, _event: &eventstore::VersionedTransitionEvent) -> usize { state + 1 }
    }

    let count = eventstore::ProjectionReplayService::state_at_version(store.events(), "f1", 999, &CountReducer);
    assert_eq!(count, 2);
}

#[test]
fn compensation_service() {
    let mut store = eventstore::EventLogStore::new(InMemoryFlowStore::<S>::new());
    let service = eventstore::CompensationService::new(Box::new(|_event, cause| {
        Some(eventstore::CompensationPlan {
            action: "ROLLBACK".to_string(),
            metadata: format!("{{\"reason\":\"{}\"}}", cause),
        })
    }));

    let event = eventstore::VersionedTransitionEvent {
        flow_id: "f1".to_string(),
        version: 1,
        event_type: eventstore::EventType::Transition,
        from: Some("A".to_string()),
        to: "B".to_string(),
        trigger: "proc".to_string(),
        timestamp: std::time::Instant::now(),
        state_snapshot: "{}".to_string(),
    };

    let result = service.compensate(&event, "fail", &mut store);
    assert!(result);
    let events = store.events_for_flow("f1");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, eventstore::EventType::Compensation);
}

#[test]
fn observability_plugin_installs() {
    let sink = Arc::new(observability::InMemoryTelemetrySink::new());
    let plugin = observability::ObservabilityPlugin::new(sink.clone());
    assert_eq!(plugin.descriptor().id, "observability");

    let mut engine: FlowEngine<S> = FlowEngine::new(InMemoryFlowStore::new());
    plugin.install(&mut engine);
    // Loggers are installed — engine logger invocation is pending core wiring
}

#[test]
fn rich_resume_classification() {
    let def = build_def(true);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def, "s1", initial_data()).unwrap();

    let result = resume::RichResumeExecutor::resume(&mut engine, &flow_id, vec![], S::Pending);
    assert_eq!(result.status, resume::RichResumeStatus::Transitioned);
}

#[test]
fn idempotency_duplicate_suppression() {
    let def = build_def(true);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def, "s1", initial_data()).unwrap();

    let registry = idempotency::InMemoryIdempotencyRegistry::new();

    let r1 = idempotency::IdempotentRichResumeExecutor::resume(
        &mut engine, &registry, &flow_id,
        idempotency::CommandEnvelope { command_id: "cmd-1".into(), external_data: vec![] },
        S::Pending,
    );
    assert_eq!(r1.status, resume::RichResumeStatus::Transitioned);

    let r2 = idempotency::IdempotentRichResumeExecutor::resume(
        &mut engine, &registry, &flow_id,
        idempotency::CommandEnvelope { command_id: "cmd-1".into(), external_data: vec![] },
        S::Confirmed,
    );
    assert_eq!(r2.status, resume::RichResumeStatus::AlreadyComplete);
}

#[test]
fn diagram_generation() {
    let def = build_def(true);
    let bundle = diagram::DiagramPlugin::generate(&def);
    assert!(bundle.mermaid.contains("stateDiagram-v2"));
    assert!(bundle.markdown_summary.contains("# test"));
}

#[test]
fn documentation_generation() {
    let def = build_def(true);
    let md = docs::DocumentationPlugin::to_markdown(&def);
    assert!(md.contains("Flow Catalog: test"));
    assert!(md.contains("Created"));
    assert!(md.contains("(initial)"));
    assert!(md.contains("(terminal)"));
}

#[test]
fn scenario_generation() {
    let def = build_def(true);
    let plan = testing::ScenarioTestPlugin::generate(&def);
    assert!(plan.scenarios.len() >= 3);
    assert!(plan.scenarios[0].steps[0].contains("given flow in"));
}

#[test]
fn lint_analysis() {
    let def = build_def(true);
    let linter = lint::PolicyLintPlugin::<S>::defaults();
    let mut report = api::PluginReport::new();
    linter.analyze(&def, &mut report);
    let findings = report.findings();
    let dead = findings.iter().find(|f| f.message.contains("never consumed"));
    assert!(dead.is_some(), "expected dead data finding, got: {:?}", findings);
}

#[test]
fn hierarchy_entry_exit_compiler() {
    let mut spec = hierarchy::HierarchicalFlowSpec::new("Order", "OrderHState");
    let mut parent = hierarchy::HierarchicalStateSpec::new("PROCESSING", true, false);
    parent.entry_produces.push("AuditLog".into());
    parent.exit_produces.push("CleanupLog".into());
    let child = hierarchy::HierarchicalStateSpec::new("VALIDATING", false, false);
    parent.children.push(child);
    spec.root_states.push(parent);

    let synth = hierarchy::EntryExitCompiler::synthesize(&spec);
    assert!(synth.len() >= 2);
    assert!(synth.iter().any(|t| t.trigger.contains("__entry__")));
    assert!(synth.iter().any(|t| t.trigger.contains("__exit__")));
}

#[test]
fn hierarchy_code_generation() {
    let mut spec = hierarchy::HierarchicalFlowSpec::new("Simple", "SimpleState");
    spec.root_states.push(hierarchy::HierarchicalStateSpec::new("A", true, false));
    spec.root_states.push(hierarchy::HierarchicalStateSpec::new("B", false, true));
    spec.transitions.push(hierarchy::HierarchicalTransitionSpec::new("A", "B", "go"));

    let enum_src = hierarchy::HierarchyCodeGenerator::generate_enum_source(&spec);
    assert!(enum_src.contains("A"));
    assert!(enum_src.contains("is_terminal"));

    let skeleton = hierarchy::HierarchyCodeGenerator::generate_builder_skeleton(&spec);
    assert!(skeleton.contains("Simple"));
    assert!(skeleton.contains("go"));
}

#[test]
fn subflow_validator() {
    let def = build_def(true);

    // Create a simple subflow with no data requirements
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum SubS { SubA, SubB }
    impl FlowState for SubS {
        fn is_terminal(&self) -> bool { matches!(self, Self::SubB) }
        fn is_initial(&self) -> bool { matches!(self, Self::SubA) }
        fn all_states() -> &'static [Self] { &[Self::SubA, Self::SubB] }
    }
    struct SubProc;
    impl StateProcessor<SubS> for SubProc {
        fn name(&self) -> &str { "SubProc" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> { Ok(()) }
    }
    let sub_def = Builder::new("sub")
        .from(SubS::SubA).auto(SubS::SubB, SubProc)
        .allow_perpetual()
        .build().unwrap();

    let result = subflow::GuaranteedSubflowValidator::validate(
        &def, S::Pending, &sub_def, &HashSet::new(),
    );
    assert!(result.is_ok());
}
