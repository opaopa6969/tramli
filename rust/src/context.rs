use std::any::TypeId;
use std::collections::HashMap;

use crate::clone_any::CloneAny;
use crate::error::FlowError;

/// Accumulator for flow data. Keyed by TypeId — each type appears at most once.
///
/// Use dedicated types as keys (e.g., `struct OrderRequest { ... }`), not primitives.
/// Putting the same type twice silently overwrites the previous value.
pub struct FlowContext {
    pub flow_id: String,
    pub created_at: std::time::Instant,
    attrs: HashMap<TypeId, Box<dyn CloneAny>>,
}

impl FlowContext {
    pub fn new(flow_id: String) -> Self {
        Self {
            flow_id,
            created_at: std::time::Instant::now(),
            attrs: HashMap::new(),
        }
    }

    pub fn put<T: CloneAny + 'static>(&mut self, value: T) {
        self.attrs.insert(TypeId::of::<T>(), Box::new(value));
    }

    pub fn get<T: CloneAny + 'static>(&self) -> Result<&T, FlowError> {
        self.attrs
            .get(&TypeId::of::<T>())
            .and_then(|v| v.as_any().downcast_ref::<T>())
            .ok_or_else(|| FlowError::missing_context(std::any::type_name::<T>()))
    }

    pub fn find<T: CloneAny + 'static>(&self) -> Option<&T> {
        self.attrs
            .get(&TypeId::of::<T>())
            .and_then(|v| v.as_any().downcast_ref::<T>())
    }

    pub fn has<T: 'static>(&self) -> bool {
        self.attrs.contains_key(&TypeId::of::<T>())
    }

    pub fn has_type_id(&self, id: &TypeId) -> bool {
        self.attrs.contains_key(id)
    }

    pub fn snapshot(&self) -> HashMap<TypeId, Box<dyn CloneAny>> {
        self.attrs.clone()
    }

    pub fn restore_from(&mut self, snapshot: HashMap<TypeId, Box<dyn CloneAny>>) {
        self.attrs = snapshot;
    }

    /// Insert a type-erased value (used by engine for guard data merge).
    pub(crate) fn put_raw(&mut self, type_id: TypeId, value: Box<dyn CloneAny>) {
        self.attrs.insert(type_id, value);
    }
}

impl Clone for FlowContext {
    fn clone(&self) -> Self {
        Self {
            flow_id: self.flow_id.clone(),
            created_at: self.created_at,
            attrs: self.attrs.clone(),
        }
    }
}
