use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum OrderState { Created, PaymentPending, PaymentConfirmed, Shipped, Cancelled }

impl FlowState for OrderState {
    fn is_terminal(&self) -> bool { matches!(self, Self::Shipped | Self::Cancelled) }
    fn is_initial(&self) -> bool { matches!(self, Self::Created) }
    fn all_states() -> &'static [Self] {
        &[Self::Created, Self::PaymentPending, Self::PaymentConfirmed, Self::Shipped, Self::Cancelled]
    }
}

#[derive(Clone, Debug)] struct OrderRequest { item_id: String }
#[derive(Clone, Debug)] struct PaymentIntent { transaction_id: String }
#[derive(Clone, Debug)] struct PaymentResult { status: String }
#[derive(Clone, Debug)] struct ShipmentInfo { tracking_id: String }

struct OrderInit;
impl StateProcessor<OrderState> for OrderInit {
    fn name(&self) -> &str { "OrderInit" }
    fn requires(&self) -> Vec<TypeId> { requires![OrderRequest] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentIntent] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let req = ctx.get::<OrderRequest>()?;
        ctx.put(PaymentIntent { transaction_id: format!("txn-{}", req.item_id) });
        Ok(())
    }
}

struct ShipProcessor;
impl StateProcessor<OrderState> for ShipProcessor {
    fn name(&self) -> &str { "ShipProcessor" }
    fn requires(&self) -> Vec<TypeId> { requires![PaymentResult] }
    fn produces(&self) -> Vec<TypeId> { requires![ShipmentInfo] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(ShipmentInfo { tracking_id: "TRACK-001".into() });
        Ok(())
    }
}

struct PaymentGuard { accept: bool }
impl TransitionGuard<OrderState> for PaymentGuard {
    fn name(&self) -> &str { "PaymentGuard" }
    fn requires(&self) -> Vec<TypeId> { requires![PaymentIntent] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentResult] }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        if self.accept {
            let mut data = HashMap::new();
            data.insert(TypeId::of::<PaymentResult>(), Box::new(PaymentResult { status: "OK".into() }) as Box<dyn CloneAny>);
            GuardOutput::Accepted { data }
        } else {
            GuardOutput::Rejected { reason: "Payment declined".into() }
        }
    }
}

fn order_def(accept: bool) -> Arc<FlowDefinition<OrderState>> {
    Arc::new(Builder::new("order")
        .ttl(Duration::from_secs(86400))
        .max_guard_retries(3)
        .initially_available(requires![OrderRequest])
        .from(OrderState::Created).auto(OrderState::PaymentPending, OrderInit)
        .from(OrderState::PaymentPending).external(OrderState::PaymentConfirmed, PaymentGuard { accept })
        .from(OrderState::PaymentConfirmed).auto(OrderState::Shipped, ShipProcessor)
        .on_any_error(OrderState::Cancelled)
        .build().unwrap())
}

#[test]
fn happy_path() {
    let def = order_def(true);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def.clone(), "s1",
        vec![(TypeId::of::<OrderRequest>(), Box::new(OrderRequest { item_id: "item-1".into() }) as Box<dyn CloneAny>)]).unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::PaymentPending);
    assert!(flow.context.find::<PaymentIntent>().is_some());

    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::Shipped);
    assert!(flow.is_completed());
    assert!(flow.context.find::<ShipmentInfo>().is_some());
}

#[test]
fn payment_rejected_max_retries() {
    let def = order_def(false);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def.clone(), "s1",
        vec![(TypeId::of::<OrderRequest>(), Box::new(OrderRequest { item_id: "item-1".into() }) as Box<dyn CloneAny>)]).unwrap();

    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    engine.resume_and_execute(&flow_id, vec![]).unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::Cancelled);
    assert!(flow.is_completed());
}

#[test]
#[test]
fn data_flow_graph() {
    let def = order_def(true);
    let graph = def.data_flow_graph();

    // Available data at CREATED
    assert!(graph.available_at(OrderState::Created).contains(&TypeId::of::<OrderRequest>()));
    // Available data at PaymentPending
    assert!(graph.available_at(OrderState::PaymentPending).contains(&TypeId::of::<PaymentIntent>()));

    // Producers of PaymentIntent
    let producers = graph.producers_of(&TypeId::of::<PaymentIntent>());
    assert!(!producers.is_empty());
    assert_eq!(producers[0].name, "OrderInit");

    // Consumers of OrderRequest
    let consumers = graph.consumers_of(&TypeId::of::<OrderRequest>());
    assert!(!consumers.is_empty());
    assert_eq!(consumers[0].name, "OrderInit");

    // Dead data — ShipmentInfo is produced but never required
    assert!(graph.dead_data().contains(&TypeId::of::<ShipmentInfo>()));
}

#[test]
fn data_flow_lifetime() {
    let def = order_def(true);
    let lt = def.data_flow_graph().lifetime(&TypeId::of::<PaymentIntent>());
    assert!(lt.is_some());
    let (first, _last) = lt.unwrap();
    assert_eq!(first, OrderState::PaymentPending);
}

#[test]
fn data_flow_pruning_hints() {
    let def = order_def(true);
    let hints = def.data_flow_graph().pruning_hints();
    assert!(hints.contains_key(&OrderState::Shipped));
}

#[test]
fn processor_compatibility() {
    assert!(DataFlowGraph::<OrderState>::is_compatible(
        &OrderInit.requires(), &OrderInit.produces(),
        &OrderInit.requires(), &OrderInit.produces(),
    ));
    assert!(!DataFlowGraph::<OrderState>::is_compatible(
        &OrderInit.requires(), &OrderInit.produces(),
        &ShipProcessor.requires(), &ShipProcessor.produces(),
    ));
}

#[test]
fn assert_data_flow_happy_path() {
    let def = order_def(true);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def.clone(), "s1",
        vec![(TypeId::of::<OrderRequest>(), Box::new(OrderRequest { item_id: "item-1".into() }) as Box<dyn CloneAny>)]).unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    let missing = def.data_flow_graph().assert_data_flow(&flow.context, flow.current_state());
    assert!(missing.is_empty(), "Missing types at {:?}", flow.current_state());
}

// ─── v1.4.0+ API tests ──────────────────────────────

#[test]
fn impact_of() {
    let def = order_def(true);
    let (prods, cons) = def.data_flow_graph().impact_of(&TypeId::of::<PaymentIntent>());
    assert!(!prods.is_empty());
    assert!(!cons.is_empty());
}

#[test]
fn parallelism_hints() {
    let def = order_def(true);
    let hints = def.data_flow_graph().parallelism_hints();
    // may be empty if all dependent, but should not panic
    assert!(hints.len() >= 0);
}

#[test]
fn to_json() {
    let def = order_def(true);
    let json = def.data_flow_graph().to_json();
    assert!(json.contains("\"types\""));
    assert!(json.contains("\"deadData\""));
}

#[test]
fn migration_order_and_markdown() {
    let def = order_def(true);
    let order = def.data_flow_graph().migration_order();
    assert!(!order.is_empty());

    let md = def.data_flow_graph().to_markdown();
    assert!(md.contains("Migration Checklist"));
}

#[test]
fn test_scaffold() {
    let def = order_def(true);
    let scaffold = def.data_flow_graph().test_scaffold();
    assert!(!scaffold.is_empty());
}

#[test]
fn generate_invariant_assertions() {
    let def = order_def(true);
    let assertions = def.data_flow_graph().generate_invariant_assertions();
    assert!(!assertions.is_empty());
}

#[test]
fn context_alias() {
    let mut ctx = tramli::FlowContext::new("test-alias".into());
    ctx.register_alias::<OrderRequest>("OrderRequest");
    assert_eq!(ctx.alias_of(&TypeId::of::<OrderRequest>()), Some("OrderRequest"));
    assert_eq!(ctx.type_id_of_alias("OrderRequest"), Some(&TypeId::of::<OrderRequest>()));
}

#[test]
fn mermaid_state_diagram() {
    let def = order_def(true);
    let mermaid = MermaidGenerator::generate(&def);
    assert!(mermaid.contains("stateDiagram-v2"));
    assert!(mermaid.contains("[*] --> Created"));
    assert!(mermaid.contains("Shipped --> [*]"));
}

#[test]
fn mermaid_data_flow() {
    let def = order_def(true);
    let mermaid = MermaidGenerator::generate_data_flow(&def);
    assert!(mermaid.contains("flowchart LR"));
    assert!(mermaid.contains("OrderInit"));
    assert!(mermaid.contains("produces"));
    assert!(mermaid.contains("requires"));
}

#[test]
fn processor_throws_routes_to_error() {
    struct FailProc;
    impl StateProcessor<OrderState> for FailProc {
        fn name(&self) -> &str { "FailProc" }
        fn requires(&self) -> Vec<TypeId> { requires![OrderRequest] }
        fn produces(&self) -> Vec<TypeId> { requires![PaymentIntent] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
            Err(FlowError::new("PROC_ERROR", "boom"))
        }
    }

    let def = Arc::new(Builder::new("err")
        .initially_available(requires![OrderRequest])
        .from(OrderState::Created).auto(OrderState::PaymentPending, FailProc)
        .from(OrderState::PaymentPending).external(OrderState::PaymentConfirmed, PaymentGuard { accept: true })
        .from(OrderState::PaymentConfirmed).auto(OrderState::Shipped, ShipProcessor)
        .on_any_error(OrderState::Cancelled)
        .build().unwrap());

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def, "s1",
        vec![(TypeId::of::<OrderRequest>(), Box::new(OrderRequest { item_id: "x".into() }) as Box<dyn CloneAny>)]).unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::Cancelled);
    assert!(flow.is_completed());
}
