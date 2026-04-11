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
    version: u32,
    pub created_at: Instant,
    pub expires_at: Instant,
    exit_state: Option<String>,
}

impl<S: FlowState> FlowInstance<S> {
    pub fn new(
        id: String, session_id: String,
        definition: std::sync::Arc<FlowDefinition<S>>,
        context: FlowContext, current_state: S, expires_at: Instant,
    ) -> Self {
        Self {
            id, session_id, definition, context, current_state,
            guard_failure_count: 0, version: 0,
            created_at: Instant::now(), expires_at,
            exit_state: None,
        }
    }

    /// Restore from persisted state.
    pub fn restore(
        id: String, session_id: String,
        definition: std::sync::Arc<FlowDefinition<S>>,
        context: FlowContext, current_state: S,
        created_at: Instant, expires_at: Instant,
        guard_failure_count: usize, version: u32,
        exit_state: Option<String>,
    ) -> Self {
        Self {
            id, session_id, definition, context, current_state,
            guard_failure_count, version, created_at, expires_at, exit_state,
        }
    }

    pub fn current_state(&self) -> S { self.current_state }
    pub fn guard_failure_count(&self) -> usize { self.guard_failure_count }
    pub fn version(&self) -> u32 { self.version }
    pub fn exit_state(&self) -> Option<&str> { self.exit_state.as_deref() }
    pub fn is_completed(&self) -> bool { self.exit_state.is_some() }

    /// Return a copy with the given version. For FlowStore optimistic locking.
    pub fn with_version(&self, new_version: u32) -> Self {
        Self::restore(
            self.id.clone(), self.session_id.clone(), self.definition.clone(),
            FlowContext::new(self.id.clone()), // context is shared via Arc in real impls
            self.current_state, self.created_at, self.expires_at,
            self.guard_failure_count, new_version, self.exit_state.clone(),
        )
    }

    pub(crate) fn transition_to(&mut self, state: S) { self.current_state = state; }
    pub(crate) fn increment_guard_failure(&mut self) { self.guard_failure_count += 1; }
    pub(crate) fn complete(&mut self, exit_state: impl Into<String>) { self.exit_state = Some(exit_state.into()); }
}
