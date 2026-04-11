use std::time::Instant;
use tramli::{FlowState, FlowStore, InMemoryFlowStore, FlowInstance, TransitionRecord};

/// Audited transition record.
#[derive(Debug, Clone)]
pub struct AuditedTransitionRecord {
    pub flow_id: String,
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub timestamp: Instant,
}

/// Auditing store decorator — captures transition records.
pub struct AuditingStore<S: FlowState> {
    pub delegate: InMemoryFlowStore<S>,
    audit_log: Vec<AuditedTransitionRecord>,
}

impl<S: FlowState> AuditingStore<S> {
    pub fn new(delegate: InMemoryFlowStore<S>) -> Self {
        Self { delegate, audit_log: Vec::new() }
    }

    pub fn create(&mut self, flow: FlowInstance<S>) {
        self.delegate.create(flow);
    }

    pub fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>> {
        self.delegate.get(flow_id)
    }

    pub fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>> {
        self.delegate.get_mut(flow_id)
    }

    pub fn record_transition(&mut self, flow_id: &str, from: &str, to: &str, trigger: &str) {
        self.delegate.record_transition(flow_id, from, to, trigger);
        self.audit_log.push(AuditedTransitionRecord {
            flow_id: flow_id.to_string(),
            from: from.to_string(),
            to: to.to_string(),
            trigger: trigger.to_string(),
            timestamp: Instant::now(),
        });
    }

    pub fn audited_transitions(&self) -> &[AuditedTransitionRecord] {
        &self.audit_log
    }

    pub fn transition_log(&self) -> &[tramli::TransitionRecord] {
        self.delegate.transition_log()
    }

    pub fn clear(&mut self) {
        self.delegate.clear();
        self.audit_log.clear();
    }
}

impl<S: FlowState> FlowStore<S> for AuditingStore<S> {
    fn create(&mut self, flow: FlowInstance<S>) { self.delegate.create(flow); }
    fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>> { self.delegate.get(flow_id) }
    fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>> { self.delegate.get_mut(flow_id) }
    fn record_transition(&mut self, flow_id: &str, from: &str, to: &str, trigger: &str) {
        self.record_transition(flow_id, from, to, trigger);
    }
    fn transition_log(&self) -> &[TransitionRecord] { self.delegate.transition_log() }
    fn clear(&mut self) { self.clear(); }
}
