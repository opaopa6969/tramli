//! # tramli
//!
//! Constrained flow engine — state machines that prevent invalid transitions at build time.
//! Intentionally synchronous. See `docs/async-integration.md` for async I/O patterns.

mod clone_any;
mod context;
mod definition;
mod engine;
mod error;
mod instance;
mod store;
mod types;

pub use clone_any::CloneAny;
pub use context::FlowContext;
pub use definition::{FlowDefinition, Builder, FromBuilder, BranchBuilder};
pub use engine::FlowEngine;
pub use error::FlowError;
pub use instance::FlowInstance;
pub use store::{InMemoryFlowStore, TransitionRecord};
pub use types::*;

#[macro_export]
macro_rules! requires {
    ($($t:ty),* $(,)?) => {
        vec![$(std::any::TypeId::of::<$t>()),*]
    }
}

#[macro_export]
macro_rules! guard_data {
    ($($val:expr),* $(,)?) => {{
        let mut map = std::collections::HashMap::new();
        $(
            map.insert(
                std::any::TypeId::of_val(&$val),
                Box::new($val) as Box<dyn $crate::CloneAny>,
            );
        )*
        map
    }}
}
