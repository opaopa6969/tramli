use std::collections::HashSet;
use std::time::Instant;

use crate::context::FlowContext;
use crate::definition::FlowDefinition;
use crate::types::FlowState;

pub struct FlowInstance<S: FlowState> {
    pub id: String,
    pub session_id: String,
    pub definition: std::sync::Arc<FlowDefinition<S>>,
    pub context: FlowContext,
    current_state: S,
    guard_failure_count: usize,
    guard_failure_counts: std::collections::HashMap<String, usize>,
    version: u32,
    pub created_at: Instant,
    pub expires_at: Instant,
    state_entered_at: Instant,
    last_error: Option<String>,
    exit_state: Option<String>,
    active_sub_flow: Option<Box<dyn crate::sub_flow::SubFlowInstance>>,
}

impl<S: FlowState> FlowInstance<S> {
    pub fn new(
        id: String,
        session_id: String,
        definition: std::sync::Arc<FlowDefinition<S>>,
        context: FlowContext,
        current_state: S,
        expires_at: Instant,
    ) -> Self {
        let now = Instant::now();
        Self {
            id,
            session_id,
            definition,
            context,
            current_state,
            guard_failure_count: 0,
            guard_failure_counts: std::collections::HashMap::new(),
            version: 0,
            created_at: now,
            expires_at,
            state_entered_at: now,
            last_error: None,
            exit_state: None,
            active_sub_flow: None,
        }
    }

    /// Restore from persisted state.
    pub fn restore(
        id: String,
        session_id: String,
        definition: std::sync::Arc<FlowDefinition<S>>,
        context: FlowContext,
        current_state: S,
        created_at: Instant,
        expires_at: Instant,
        guard_failure_count: usize,
        version: u32,
        exit_state: Option<String>,
    ) -> Self {
        Self {
            id,
            session_id,
            definition,
            context,
            current_state,
            guard_failure_count,
            guard_failure_counts: std::collections::HashMap::new(),
            version,
            created_at,
            expires_at,
            state_entered_at: created_at,
            last_error: None,
            exit_state,
            active_sub_flow: None,
        }
    }

    pub fn current_state(&self) -> S {
        self.current_state
    }
    pub fn guard_failure_count(&self) -> usize {
        self.guard_failure_count
    }
    /// Guard failure count for a specific guard (by name).
    pub fn guard_failure_count_for(&self, guard_name: &str) -> usize {
        self.guard_failure_counts
            .get(guard_name)
            .copied()
            .unwrap_or(0)
    }
    pub fn version(&self) -> u32 {
        self.version
    }
    pub fn exit_state(&self) -> Option<&str> {
        self.exit_state.as_deref()
    }
    pub fn is_completed(&self) -> bool {
        self.exit_state.is_some()
    }
    /// Last error message (set when a processor throws and error transition fires).
    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    /// State path from root. E.g. ["PAYMENT", "CONFIRM"].
    pub fn state_path(&self) -> Vec<String> {
        let mut path = vec![format!("{:?}", self.current_state)];
        if let Some(sub_flow) = &self.active_sub_flow {
            path.extend(sub_flow.state_path());
        }
        path
    }

    /// State path as slash-separated string.
    pub fn state_path_string(&self) -> String {
        self.state_path().join("/")
    }

    /// Data types available in context at current state (from data-flow graph).
    pub fn available_data(&self) -> HashSet<std::any::TypeId> {
        self.definition
            .data_flow_graph()
            .available_at(self.current_state)
    }

    /// Data types that the next transition requires but are not yet in context.
    pub fn missing_for(&self) -> Vec<std::any::TypeId> {
        let mut missing = Vec::new();
        for t in self.definition.transitions_from(self.current_state) {
            if let Some(g) = &t.guard {
                for r in g.requires() {
                    if !self.context.has_type_id(&r) {
                        missing.push(r);
                    }
                }
            }
            if let Some(p) = &t.processor {
                for r in p.requires() {
                    if !self.context.has_type_id(&r) {
                        missing.push(r);
                    }
                }
            }
        }
        missing.sort();
        missing.dedup();
        missing
    }

    /// Types required by the next external transition.
    pub fn waiting_for(&self) -> Vec<std::any::TypeId> {
        if let Some(sub_flow) = &self.active_sub_flow {
            return sub_flow.waiting_for();
        }
        let mut waiting = Vec::new();
        for external in self.definition.externals_from(self.current_state) {
            let Some(guard) = &external.guard else {
                continue;
            };
            let keys = guard
                .external_trigger()
                .map_or_else(|| guard.requires(), |trigger| vec![trigger]);
            for key in keys {
                if !waiting.contains(&key) {
                    waiting.push(key);
                }
            }
        }
        waiting
    }

    /// Update the version in-place. For FlowStore optimistic locking after save.
    pub fn set_version_public(&mut self, new_version: u32) {
        self.version = new_version;
    }

    pub fn state_entered_at(&self) -> Instant {
        self.state_entered_at
    }
    pub(crate) fn has_active_sub_flow(&self) -> bool {
        self.active_sub_flow.is_some()
    }
    pub(crate) fn take_active_sub_flow(
        &mut self,
    ) -> Option<Box<dyn crate::sub_flow::SubFlowInstance>> {
        self.active_sub_flow.take()
    }
    pub(crate) fn set_active_sub_flow(
        &mut self,
        sub_flow: Box<dyn crate::sub_flow::SubFlowInstance>,
    ) {
        self.active_sub_flow = Some(sub_flow);
    }
    pub(crate) fn transition_to(&mut self, state: S) {
        let changed = self.current_state != state;
        self.current_state = state;
        self.state_entered_at = Instant::now();
        if changed {
            self.guard_failure_count = 0;
            self.guard_failure_counts.clear();
        }
    }
    pub(crate) fn increment_guard_failure_named(&mut self, guard_name: &str) {
        self.guard_failure_count += 1;
        *self
            .guard_failure_counts
            .entry(guard_name.to_string())
            .or_default() += 1;
    }
    pub(crate) fn set_last_error(&mut self, error: impl Into<String>) {
        self.last_error = Some(error.into());
    }
    pub(crate) fn complete(&mut self, exit_state: impl Into<String>) {
        self.exit_state = Some(exit_state.into());
        self.active_sub_flow = None;
    }
}
