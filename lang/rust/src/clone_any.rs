use std::any::Any;

/// Trait combining Any + Clone + Send for type-erased cloneable storage.
///
/// All types stored in FlowContext must implement this trait.
/// Use `#[derive(Clone)]` on your types — the blanket impl covers the rest.
pub trait CloneAny: Any + Send {
    fn clone_box(&self) -> Box<dyn CloneAny>;
    fn as_any(&self) -> &dyn Any;
}

impl<T: Any + Clone + Send + 'static> CloneAny for T {
    fn clone_box(&self) -> Box<dyn CloneAny> {
        Box::new(self.clone())
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}

impl Clone for Box<dyn CloneAny> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
