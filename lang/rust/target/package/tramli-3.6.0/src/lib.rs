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
pub use data_flow_graph::{DataFlowGraph, NodeInfo};
pub use definition::{FlowDefinition, Builder, FromBuilder, BranchBuilder, SubFlowBuilder};
pub use engine::{FlowEngine, TransitionLogEntry, ErrorLogEntry, GuardLogEntry};
pub use error::FlowError;
pub use instance::FlowInstance;
pub use mermaid::MermaidGenerator;
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
