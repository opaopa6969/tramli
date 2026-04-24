//! # tramli
//!
//! Constrained flow engine — state machines that prevent invalid transitions at build time.
//! Intentionally synchronous. See `docs/async-integration.md` for async I/O patterns.

mod clone_any;
mod context;
mod data_flow_graph;
mod definition;
mod engine;
mod error;
mod instance;
mod mermaid;
pub mod pipeline;
mod store;
pub mod sub_flow;
mod types;

pub use clone_any::CloneAny;
pub use context::FlowContext;
pub use data_flow_graph::{DataFlowGraph, NodeInfo, ExplainResult, MissingInfo, ProducerInfo};
pub use definition::{FlowDefinition, Builder, FromBuilder, BranchBuilder, SubFlowBuilder, ValidationError, BuildResult};
pub use engine::{FlowEngine, TransitionLogEntry, ErrorLogEntry, GuardLogEntry};
pub use error::FlowError;
pub use instance::FlowInstance;
pub use mermaid::{MermaidGenerator, MermaidView};
pub use store::{FlowStore, InMemoryFlowStore, TransitionRecord};
pub use types::*;

/// Shorthand for creating a Vec<TypeId> from type names.
/// Use in `requires()` and `produces()` implementations.
#[macro_export]
macro_rules! data_types {
    ($($t:ty),* $(,)?) => {
        vec![$(std::any::TypeId::of::<$t>()),*]
    }
}

/// Alias for `data_types!`. Kept for backward compatibility.
#[macro_export]
macro_rules! requires {
    ($($t:ty),* $(,)?) => {
        vec![$(std::any::TypeId::of::<$t>()),*]
    }
}

/// Build a `HashMap<TypeId, Box<dyn CloneAny>>` from values.
/// Use in `GuardOutput::accepted(guard_data![val1, val2])`.
#[macro_export]
macro_rules! guard_data {
    ($($val:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut map = std::collections::HashMap::new();
        $({
            let v = $val;
            fn _tid<T: $crate::CloneAny + 'static>(_: &T) -> std::any::TypeId {
                std::any::TypeId::of::<T>()
            }
            map.insert(_tid(&v), Box::new(v) as Box<dyn $crate::CloneAny>);
        })*
        map
    }};
}

// FlowEngine<S> is Send when S: FlowState — safe to move between threads.
// Not Sync (CloneAny = Any + Send, no Sync), so use &mut self or pool-of-owned.
// crossbeam channel, object_pool, or thread_local all work.
fn _assert_send<S: FlowState>() {
    fn _must_be<T: Send>() {}
    _must_be::<FlowEngine<S>>();
    _must_be::<InMemoryFlowStore<S>>();
}
