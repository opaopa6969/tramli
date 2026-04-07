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
