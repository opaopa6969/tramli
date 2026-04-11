use std::any::TypeId;
use std::collections::HashSet;
use std::sync::Mutex;
use tramli::{CloneAny, FlowEngine, FlowState};
use crate::resume::{RichResumeExecutor, RichResumeResult, RichResumeStatus};

/// Idempotency registry trait.
pub trait IdempotencyRegistry: Send + Sync {
    fn mark_if_first_seen(&self, flow_id: &str, command_id: &str) -> bool;
}

/// In-memory idempotency registry.
pub struct InMemoryIdempotencyRegistry {
    seen: Mutex<HashSet<String>>,
}

impl InMemoryIdempotencyRegistry {
    pub fn new() -> Self {
        Self { seen: Mutex::new(HashSet::new()) }
    }
}

impl Default for InMemoryIdempotencyRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl IdempotencyRegistry for InMemoryIdempotencyRegistry {
    fn mark_if_first_seen(&self, flow_id: &str, command_id: &str) -> bool {
        let key = format!("{}::{}", flow_id, command_id);
        self.seen.lock().unwrap().insert(key)
    }
}

/// Command envelope — wraps external data with a unique command ID.
pub struct CommandEnvelope {
    pub command_id: String,
    pub external_data: Vec<(TypeId, Box<dyn CloneAny>)>,
}

/// Idempotent rich resume executor — duplicate suppression.
pub struct IdempotentRichResumeExecutor;

impl IdempotentRichResumeExecutor {
    pub fn resume<S: FlowState>(
        engine: &mut FlowEngine<S>,
        registry: &dyn IdempotencyRegistry,
        flow_id: &str,
        envelope: CommandEnvelope,
        previous_state: S,
    ) -> RichResumeResult {
        if !registry.mark_if_first_seen(flow_id, &envelope.command_id) {
            return RichResumeResult {
                status: RichResumeStatus::AlreadyComplete,
                error: Some(tramli::FlowError::new(
                    "DUPLICATE_COMMAND",
                    format!("duplicate commandId {}", envelope.command_id),
                )),
            };
        }
        RichResumeExecutor::resume(engine, flow_id, envelope.external_data, previous_state)
    }
}
