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
/// the engine restores the context snapshot taken before processor execution
/// and routes to the error transition.
pub struct FlowContext {
    pub flow_id: String,
    pub created_at: std::time::Instant,
    attrs: HashMap<TypeId, Box<dyn CloneAny>>,
    alias_to_type: HashMap<String, TypeId>,
    type_to_alias: HashMap<TypeId, String>,
    logged_puts: Option<HashMap<TypeId, &'static str>>,
}

impl FlowContext {
    pub fn new(flow_id: String) -> Self {
        Self {
            flow_id,
            created_at: std::time::Instant::now(),
            attrs: HashMap::new(),
            alias_to_type: HashMap::new(),
            type_to_alias: HashMap::new(),
            logged_puts: None,
        }
    }

    pub fn put<T: CloneAny + 'static>(&mut self, value: T) {
        if let Some(puts) = &mut self.logged_puts {
            puts.insert(TypeId::of::<T>(), std::any::type_name::<T>());
        }
        self.attrs.insert(TypeId::of::<T>(), Box::new(value));
    }

    // Enabled only around a processor when the engine has a state logger.
    pub(crate) fn begin_logged_puts(&mut self) {
        self.logged_puts = Some(HashMap::new());
    }

    pub(crate) fn finish_logged_puts(&mut self, success: bool) -> Vec<(String, String)> {
        let Some(puts) = self.logged_puts.take() else {
            return Vec::new();
        };
        if !success {
            return Vec::new();
        }
        puts.into_iter()
            .filter_map(|(id, name)| {
                self.attrs
                    .get(&id)
                    .map(|value| (name.to_string(), state_log_value(&**value, name)))
            })
            .collect()
    }

    pub fn get<T: CloneAny + 'static>(&self) -> Result<&T, FlowError> {
        self.attrs
            .get(&TypeId::of::<T>())
            .and_then(|v| (**v).as_any().downcast_ref::<T>())
            .ok_or_else(|| FlowError::missing_context(std::any::type_name::<T>()))
    }

    pub fn find<T: CloneAny + 'static>(&self) -> Option<&T> {
        self.attrs
            .get(&TypeId::of::<T>())
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
        self.attrs
            .iter()
            .map(|(k, v)| (*k, (**v).clone_box()))
            .collect()
    }

    /// Restore context from a snapshot (for rollback on error).
    pub fn restore_from(&mut self, snapshot: HashMap<TypeId, Box<dyn CloneAny>>) {
        self.attrs = snapshot;
    }

    // ─── Alias support (for serialization) ──────────────────

    /// Register a string alias for a type. Used for cross-language serialization.
    pub fn register_alias<T: 'static>(&mut self, alias: &str) {
        self.alias_to_type
            .insert(alias.to_string(), TypeId::of::<T>());
        self.type_to_alias
            .insert(TypeId::of::<T>(), alias.to_string());
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

// CloneAny deliberately has no Debug/serialization bound. Preserve that API:
// render common scalar values, and identify opaque application types explicitly.
fn state_log_value(value: &dyn CloneAny, name: &str) -> String {
    let any = value.as_any();
    macro_rules! scalar {
        ($($ty:ty),*) => { $(if let Some(v) = any.downcast_ref::<$ty>() { return v.to_string(); })* };
    }
    scalar!(
        String, &str, bool, char, u8, u16, u32, u64, u128, usize, i8, i16, i32, i64, i128, isize,
        f32, f64
    );
    format!("<opaque: {name}>")
}
