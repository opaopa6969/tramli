use std::any::TypeId;
use std::collections::HashMap;

use crate::clone_any::CloneAny;
use crate::error::FlowError;

/// Accumulator for flow data. Keyed by TypeId — each type appears at most once.
///
/// Use dedicated types as keys (e.g., `struct OrderRequest { ... }`), not primitives.
/// Putting the same type twice silently overwrites the previous value.
///
/// # Processor Contract
/// Processors MUST NOT perform destructive changes on existing context entries.
/// Processors should only add new entries via `put()`. On processor failure,
/// the engine routes to the error transition without restoring context.
pub struct FlowContext {
    pub flow_id: String,
    pub created_at: std::time::Instant,
    attrs: HashMap<TypeId, Box<dyn CloneAny>>,
    alias_to_type: HashMap<String, TypeId>,
    type_to_alias: HashMap<TypeId, String>,
}

impl FlowContext {
    pub fn new(flow_id: String) -> Self {
        Self {
            flow_id, created_at: std::time::Instant::now(),
            attrs: HashMap::new(), alias_to_type: HashMap::new(), type_to_alias: HashMap::new(),
        }
    }

    pub fn put<T: CloneAny + 'static>(&mut self, value: T) {
        self.attrs.insert(TypeId::of::<T>(), Box::new(value));
    }

    pub fn get<T: CloneAny + 'static>(&self) -> Result<&T, FlowError> {
        self.attrs.get(&TypeId::of::<T>())
            .and_then(|v| (**v).as_any().downcast_ref::<T>())
            .ok_or_else(|| FlowError::missing_context(std::any::type_name::<T>()))
    }

    pub fn find<T: CloneAny + 'static>(&self) -> Option<&T> {
        self.attrs.get(&TypeId::of::<T>())
            .and_then(|v| (**v).as_any().downcast_ref::<T>())
    }

    pub fn has<T: 'static>(&self) -> bool {
        self.attrs.contains_key(&TypeId::of::<T>())
    }

    pub fn has_type_id(&self, id: &TypeId) -> bool {
        self.attrs.contains_key(id)
    }

    /// Insert a type-erased value (used by engine for guard data merge and initial data).
    pub(crate) fn put_raw(&mut self, type_id: TypeId, value: Box<dyn CloneAny>) {
        self.attrs.insert(type_id, value);
    }

    /// Create a snapshot of the current context (for rollback on error).
    pub fn snapshot(&self) -> HashMap<TypeId, Box<dyn CloneAny>> {
        self.attrs.iter().map(|(k, v)| (*k, (**v).clone_box())).collect()
    }

    /// Restore context from a snapshot (for rollback on error).
    pub fn restore_from(&mut self, snapshot: HashMap<TypeId, Box<dyn CloneAny>>) {
        self.attrs = snapshot;
    }

    // ─── Alias support (for serialization) ──────────────────

    /// Register a string alias for a type. Used for cross-language serialization.
    pub fn register_alias<T: 'static>(&mut self, alias: &str) {
        self.alias_to_type.insert(alias.to_string(), TypeId::of::<T>());
        self.type_to_alias.insert(TypeId::of::<T>(), alias.to_string());
    }

    /// Get the alias for a TypeId (if registered).
    pub fn alias_of(&self, type_id: &TypeId) -> Option<&str> {
        self.type_to_alias.get(type_id).map(|s| s.as_str())
    }

    /// Get the TypeId for an alias (if registered).
    pub fn type_id_of_alias(&self, alias: &str) -> Option<&TypeId> {
        self.alias_to_type.get(alias)
    }
}
