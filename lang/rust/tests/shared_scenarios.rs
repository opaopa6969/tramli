//! Shared test scenarios matching `shared-tests/scenarios/*.yaml`.
//!
//! These tests must pass identically in Java, TypeScript, and Rust. The Java
//! counterpart is `lang/java/src/test/java/org/unlaxer/tramli/SharedScenarioTest.java`
//! and the TypeScript one is `lang/ts/tests/shared-scenarios.test.ts`.
//!
//! State and exit-state names follow each language's own naming convention
//! (`PAYMENT_PENDING` in Java/TS, `PaymentPending` in Rust); everything else —
//! transition sequence, context values, guard failure counts, completion flags —
//! is asserted identically.

#![allow(dead_code)]

use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tramli::*;

// ═══════════════════════════════════════════════════════════════
// Order flow — shared by order-happy-path and order-payment-rejected
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum OrderState {
    Created,
    PaymentPending,
    PaymentConfirmed,
    Shipped,
    Cancelled,
}

impl FlowState for OrderState {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Shipped | Self::Cancelled)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::Created)
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::Created,
            Self::PaymentPending,
            Self::PaymentConfirmed,
            Self::Shipped,
            Self::Cancelled,
        ]
    }
}

#[derive(Clone, Debug)]
struct OrderRequest {
    item_id: String,
    quantity: u32,
}
#[derive(Clone, Debug)]
struct PaymentIntent {
    transaction_id: String,
}
#[derive(Clone, Debug)]
struct PaymentResult {
    status: String,
}
#[derive(Clone, Debug)]
struct ShipmentInfo {
    tracking_id: String,
}

struct OrderInit;
impl StateProcessor<OrderState> for OrderInit {
    fn name(&self) -> &str {
        "OrderInit"
    }
    fn requires(&self) -> Vec<TypeId> {
        requires![OrderRequest]
    }
    fn produces(&self) -> Vec<TypeId> {
        requires![PaymentIntent]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let req = ctx.get::<OrderRequest>()?;
        ctx.put(PaymentIntent {
            transaction_id: format!("txn-{}", req.item_id),
        });
        Ok(())
    }
}

struct ShipProcessor;
impl StateProcessor<OrderState> for ShipProcessor {
    fn name(&self) -> &str {
        "ShipProcessor"
    }
    fn requires(&self) -> Vec<TypeId> {
        requires![PaymentResult]
    }
    fn produces(&self) -> Vec<TypeId> {
        requires![ShipmentInfo]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(ShipmentInfo {
            tracking_id: "TRACK-001".into(),
        });
        Ok(())
    }
}

/// `guard_behavior.PaymentGuard: reject` in the YAML maps to `accept = false`.
struct PaymentGuard {
    accept: bool,
}
impl TransitionGuard<OrderState> for PaymentGuard {
    fn name(&self) -> &str {
        "PaymentGuard"
    }
    fn requires(&self) -> Vec<TypeId> {
        requires![PaymentIntent]
    }
    fn produces(&self) -> Vec<TypeId> {
        requires![PaymentResult]
    }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        if self.accept {
            let mut data = HashMap::new();
            data.insert(
                TypeId::of::<PaymentResult>(),
                Box::new(PaymentResult {
                    status: "OK".into(),
                }) as Box<dyn CloneAny>,
            );
            GuardOutput::Accepted { data }
        } else {
            GuardOutput::Rejected {
                reason: "Payment declined".into(),
            }
        }
    }
}

fn order_definition(accept: bool) -> Arc<FlowDefinition<OrderState>> {
    Arc::new(
        Builder::<OrderState>::new("order")
            .ttl(Duration::from_secs(86400))
            .max_guard_retries(3)
            .initially_available(requires![OrderRequest])
            .from(OrderState::Created)
            .auto(OrderState::PaymentPending, OrderInit)
            .from(OrderState::PaymentPending)
            .external(OrderState::PaymentConfirmed, PaymentGuard { accept })
            .from(OrderState::PaymentConfirmed)
            .auto(OrderState::Shipped, ShipProcessor)
            .on_any_error(OrderState::Cancelled)
            .build()
            .unwrap(),
    )
}

fn order_initial_data(item_id: &str, quantity: u32) -> Vec<(TypeId, Box<dyn CloneAny>)> {
    vec![(
        TypeId::of::<OrderRequest>(),
        Box::new(OrderRequest {
            item_id: item_id.into(),
            quantity,
        }) as Box<dyn CloneAny>,
    )]
}

// ─── order-happy-path.yaml ─────────────────────────────────────

#[test]
fn order_happy_path() {
    let def = order_definition(true);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());

    // Step 1: start → PaymentPending, PaymentIntent.transactionId == "txn-item-1"
    let flow_id = engine
        .start_flow(
            def.clone(),
            "session-happy",
            order_initial_data("item-1", 3),
        )
        .unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::PaymentPending);
    let intent = flow
        .context
        .find::<PaymentIntent>()
        .expect("PaymentIntent must be in context at PaymentPending");
    assert_eq!(intent.transaction_id, "txn-item-1");

    // Step 2: resume → Shipped, completed, ShipmentInfo.trackingId == "TRACK-001"
    engine.resume_and_execute(&flow_id, vec![]).unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::Shipped);
    assert!(flow.is_completed());
    assert_eq!(flow.exit_state(), Some("Shipped"));
    let shipment = flow
        .context
        .find::<ShipmentInfo>()
        .expect("ShipmentInfo must be in context at Shipped");
    assert_eq!(shipment.tracking_id, "TRACK-001");
}

// ─── order-payment-rejected.yaml ───────────────────────────────

#[test]
fn order_payment_rejected() {
    let def = order_definition(false);
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());

    // Start: guard rejects, so the flow parks at PaymentPending.
    let flow_id = engine
        .start_flow(
            def.clone(),
            "session-reject",
            order_initial_data("item-1", 1),
        )
        .unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::PaymentPending);
    assert_eq!(flow.guard_failure_count(), 0);

    // Resume 1: still PaymentPending, guard failure count == 1
    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::PaymentPending);
    assert_eq!(flow.guard_failure_count(), 1);

    // Resume 2: still PaymentPending, guard failure count == 2
    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::PaymentPending);
    assert_eq!(flow.guard_failure_count(), 2);

    // Resume 3: max retries exceeded → Cancelled, completed
    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), OrderState::Cancelled);
    assert!(flow.is_completed());
    assert_eq!(flow.exit_state(), Some("Cancelled"));
}

// ═══════════════════════════════════════════════════════════════
// Sub-flow scenarios
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Debug)]
struct Input {
    value: String,
}
#[derive(Clone, Debug)]
struct SubOutput {
    value: String,
}

/// Parent flow shape shared by both sub-flow scenarios.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum TwoStep {
    Init,
    Done,
    Error,
}
impl FlowState for TwoStep {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done | Self::Error)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::Init)
    }
    fn all_states() -> &'static [Self] {
        &[Self::Init, Self::Done, Self::Error]
    }
}

fn input_data(value: &str) -> Vec<(TypeId, Box<dyn CloneAny>)> {
    vec![(
        TypeId::of::<Input>(),
        Box::new(Input {
            value: value.into(),
        }) as Box<dyn CloneAny>,
    )]
}

// ─── subflow-basic.yaml ────────────────────────────────────────

#[test]
fn subflow_basic() {
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum SubStep {
        Init,
        Process,
        Done,
    }
    impl FlowState for SubStep {
        fn is_terminal(&self) -> bool {
            matches!(self, Self::Done)
        }
        fn is_initial(&self) -> bool {
            matches!(self, Self::Init)
        }
        fn all_states() -> &'static [Self] {
            &[Self::Init, Self::Process, Self::Done]
        }
    }

    struct SubP1;
    impl StateProcessor<SubStep> for SubP1 {
        fn name(&self) -> &str {
            "SubP1"
        }
        fn requires(&self) -> Vec<TypeId> {
            requires![Input]
        }
        fn produces(&self) -> Vec<TypeId> {
            requires![SubOutput]
        }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(SubOutput {
                value: "SubP1".into(),
            });
            Ok(())
        }
    }

    struct SubP2;
    impl StateProcessor<SubStep> for SubP2 {
        fn name(&self) -> &str {
            "SubP2"
        }
        fn requires(&self) -> Vec<TypeId> {
            requires![SubOutput]
        }
        fn produces(&self) -> Vec<TypeId> {
            vec![]
        }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
            Ok(())
        }
    }

    let sub_def = Arc::new(
        Builder::<SubStep>::new("sub")
            .ttl(Duration::from_secs(60))
            .initially_available(requires![Input])
            .from(SubStep::Init)
            .auto(SubStep::Process, SubP1)
            .from(SubStep::Process)
            .auto(SubStep::Done, SubP2)
            .build()
            .unwrap(),
    );

    let main_def = Arc::new(
        Builder::<TwoStep>::new("main-with-subflow")
            .ttl(Duration::from_secs(60))
            .initially_available(requires![Input])
            .from(TwoStep::Init)
            .sub_flow(Box::new(tramli::sub_flow::SubFlowAdapter::new(sub_def)))
            .on_exit("Done", TwoStep::Done)
            .end_sub_flow()
            .on_any_error(TwoStep::Error)
            .build()
            .unwrap(),
    );

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(main_def, "s1", input_data("x")).unwrap();

    // Auto-chain runs through the sub-flow and returns to the parent in one call.
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), TwoStep::Done);
    assert!(flow.is_completed());
    assert!(!flow.has_active_sub_flow());
}

// ─── subflow-external.yaml ─────────────────────────────────────

#[test]
fn subflow_external() {
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum SubStep {
        Init,
        Wait,
        Done,
    }
    impl FlowState for SubStep {
        fn is_terminal(&self) -> bool {
            matches!(self, Self::Done)
        }
        fn is_initial(&self) -> bool {
            matches!(self, Self::Init)
        }
        fn all_states() -> &'static [Self] {
            &[Self::Init, Self::Wait, Self::Done]
        }
    }

    struct SubP1;
    impl StateProcessor<SubStep> for SubP1 {
        fn name(&self) -> &str {
            "SubP1"
        }
        fn requires(&self) -> Vec<TypeId> {
            requires![Input]
        }
        fn produces(&self) -> Vec<TypeId> {
            requires![SubOutput]
        }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(SubOutput {
                value: "SubP1".into(),
            });
            Ok(())
        }
    }

    struct SubGuard;
    impl TransitionGuard<SubStep> for SubGuard {
        fn name(&self) -> &str {
            "SubGuard"
        }
        fn requires(&self) -> Vec<TypeId> {
            requires![SubOutput]
        }
        fn produces(&self) -> Vec<TypeId> {
            vec![]
        }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted {
                data: HashMap::new(),
            }
        }
    }

    let sub_def = Arc::new(
        Builder::<SubStep>::new("sub-ext")
            .ttl(Duration::from_secs(60))
            .initially_available(requires![Input])
            .from(SubStep::Init)
            .auto(SubStep::Wait, SubP1)
            .from(SubStep::Wait)
            .external(SubStep::Done, SubGuard)
            .build()
            .unwrap(),
    );

    let main_def = Arc::new(
        Builder::<TwoStep>::new("main-with-subflow-external")
            .ttl(Duration::from_secs(60))
            .initially_available(requires![Input])
            .from(TwoStep::Init)
            .sub_flow(Box::new(tramli::sub_flow::SubFlowAdapter::new(sub_def)))
            .on_exit("Done", TwoStep::Done)
            .end_sub_flow()
            .on_any_error(TwoStep::Error)
            .build()
            .unwrap(),
    );

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine
        .start_flow(main_def, "session-subext", input_data("x"))
        .unwrap();

    // Step 1: parent parked at Init while the sub-flow waits on its external.
    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), TwoStep::Init);
    assert!(!flow.is_completed());
    assert!(flow.has_active_sub_flow());
    let sub = flow
        .active_sub_flow()
        .expect("sub-flow must be active while waiting on its external transition");
    assert_eq!(sub.current_state_name().as_deref(), Some("Wait"));

    // Step 2: resume → sub-flow exits, parent completes, no sub-flow left.
    engine.resume_and_execute(&flow_id, vec![]).unwrap();

    let flow = engine.store.get(&flow_id).unwrap();
    assert_eq!(flow.current_state(), TwoStep::Done);
    assert!(flow.is_completed());
    assert!(!flow.has_active_sub_flow());
    assert!(flow.active_sub_flow().is_none());
}
