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

    /// Return an independent copy of the alias registry (alias → TypeId).
    pub fn export_aliases(&self) -> HashMap<String, TypeId> {
        self.alias_to_type.clone()
    }

    /// Import a registry, updating both directions like `register_alias`.
    pub fn import_aliases(&mut self, map: HashMap<String, TypeId>) {
        for (alias, type_id) in map {
            self.alias_to_type.insert(alias.clone(), type_id);
            self.type_to_alias.insert(type_id, alias);
        }
    }

    /// Return the data (alias → borrowed value). Unregistered types use the full
    /// concrete type name. Values are not serialized; callers downcast or `clone_box`.
    pub fn to_aliased_data(&self) -> HashMap<String, &dyn CloneAny> {
        self.attrs
            .iter()
            .map(|(type_id, value)| {
                let value = &**value;
                let alias = self
                    .type_to_alias
                    .get(type_id)
                    .cloned()
                    .unwrap_or_else(|| value.type_name().to_string());
                (alias, value)
            })
            .collect()
    }

    /// Import values whose actual type matches the registered alias's TypeId.
    /// Unregistered aliases and type mismatches are ignored; existing data is kept.
    pub fn from_aliased_data(&mut self, map: HashMap<String, Box<dyn CloneAny>>) {
        for (alias, value) in map {
            if let Some(&type_id) = self.alias_to_type.get(&alias) {
                if (*value).as_any().type_id() == type_id {
                    self.attrs.insert(type_id, value);
                }
            }
        }
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
