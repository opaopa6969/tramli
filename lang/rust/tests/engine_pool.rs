//! Pool/reuse API tests: FlowEngine::reset / FlowEngine::with_capacity /
//! InMemoryFlowStore::with_capacity.

#![allow(dead_code)]

use std::any::TypeId;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    A,
    B,
}
impl FlowState for S {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::B)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::A)
    }
    fn all_states() -> &'static [Self] {
        &[Self::A, Self::B]
    }
}

struct Noop;
impl StateProcessor<S> for Noop {
    fn name(&self) -> &str {
        "Noop"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

fn definition() -> Arc<FlowDefinition<S>> {
    Arc::new(
        Builder::<S>::new("t")
            .ttl(Duration::from_secs(60))
            .from(S::A)
            .auto(S::B, Noop)
            .build()
            .unwrap(),
    )
}

#[test]
fn with_capacity_starts_and_completes_flows_like_new() {
    let mut engine: FlowEngine<S> = FlowEngine::with_capacity(16);
    let fid = engine.start_flow(definition(), "s1", vec![]).unwrap();
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), S::B);
    assert!(f.is_completed());
}

#[test]
fn reset_clears_flows_and_transition_log_but_keeps_engine_usable() {
    let mut engine: FlowEngine<S> = FlowEngine::with_capacity(4);
    let fid = engine.start_flow(definition(), "s1", vec![]).unwrap();
    assert!(engine.store.get(&fid).is_some());
    assert!(!engine.store.transition_log().is_empty());

    engine.reset();

    assert!(engine.store.get(&fid).is_none());
    assert!(engine.store.transition_log().is_empty());

    // Engine is still usable after reset — can start a new flow.
    let fid2 = engine.start_flow(definition(), "s2", vec![]).unwrap();
    let f = engine.store.get(&fid2).unwrap();
    assert_eq!(f.current_state(), S::B);
}

#[test]
fn in_memory_store_with_capacity_behaves_like_new() {
    let mut store: InMemoryFlowStore<S> = InMemoryFlowStore::with_capacity(8);
    assert!(store.transition_log().is_empty());
    store.clear();
    assert!(store.transition_log().is_empty());
}
