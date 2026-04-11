use std::collections::HashMap;
use std::time::Instant;

use crate::instance::FlowInstance;
use crate::types::FlowState;

#[derive(Debug, Clone)]
pub struct TransitionRecord {
    pub flow_id: String,
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub timestamp: Instant,
}

/// In-memory FlowStore for testing.
pub struct InMemoryFlowStore<S: FlowState> {
    flows: HashMap<String, FlowInstance<S>>,
    transition_log: Vec<TransitionRecord>,
}

impl<S: FlowState> InMemoryFlowStore<S> {
    pub fn new() -> Self { Self { flows: HashMap::new(), transition_log: Vec::new() } }

    pub fn create(&mut self, flow: FlowInstance<S>) { self.flows.insert(flow.id.clone(), flow); }

    pub fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>> { self.flows.get(flow_id) }

    pub fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>> {
        self.flows.get_mut(flow_id).filter(|f| !f.is_completed())
    }

    pub fn record_transition(&mut self, flow_id: &str, from: &str, to: &str, trigger: &str) {
        self.transition_log.push(TransitionRecord {
            flow_id: flow_id.to_string(), from: from.to_string(),
            to: to.to_string(), trigger: trigger.to_string(), timestamp: Instant::now(),
        });
    }

    pub fn transition_log(&self) -> &[TransitionRecord] { &self.transition_log }
}

impl<S: FlowState> Default for InMemoryFlowStore<S> { fn default() -> Self { Self::new() } }
