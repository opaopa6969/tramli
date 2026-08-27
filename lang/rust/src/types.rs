use std::any::TypeId;
use std::collections::HashMap;
use std::fmt::Debug;
use std::hash::Hash;
use std::sync::Arc;

use crate::clone_any::CloneAny;
use crate::context::FlowContext;
use crate::error::FlowError;

/// Marker trait for flow state enums.
pub trait FlowState: Clone + Copy + Eq + Hash + Debug + Send + Sync + 'static {
    fn is_terminal(&self) -> bool;
    fn is_initial(&self) -> bool;
    fn all_states() -> &'static [Self];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionType { Auto, External, Branch, SubFlow }

/// Guard output.
pub enum GuardOutput {
    Accepted { data: HashMap<TypeId, Box<dyn CloneAny>> },
    Rejected { reason: String },
    Expired,
}

/// Processes a state transition. Must be fast and sync — no I/O.
pub trait StateProcessor<S: FlowState>: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn produces(&self) -> Vec<TypeId>;
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError>;

    /// Like `requires()` but also returns a human-readable name for each TypeId.
    /// Override this alongside `requires()` using the `requires_named!` macro.
    /// Default implementation returns empty names.
    fn requires_named(&self) -> Vec<(TypeId, &'static str)> {
        self.requires().into_iter().map(|id| (id, "")).collect()
    }

    /// Like `produces()` but also returns a human-readable name for each TypeId.
    /// Override this alongside `produces()` using the `data_types_named!` macro.
    /// Default implementation returns empty names.
    fn produces_named(&self) -> Vec<(TypeId, &'static str)> {
        self.produces().into_iter().map(|id| (id, "")).collect()
    }
}

/// Guards an external transition. Must not mutate FlowContext.
pub trait TransitionGuard<S: FlowState>: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn produces(&self) -> Vec<TypeId>;
    fn validate(&self, ctx: &FlowContext) -> GuardOutput;

    /// Like `requires()` but also returns a human-readable name for each TypeId.
    fn requires_named(&self) -> Vec<(TypeId, &'static str)> {
        self.requires().into_iter().map(|id| (id, "")).collect()
    }

    /// Like `produces()` but also returns a human-readable name for each TypeId.
    fn produces_named(&self) -> Vec<(TypeId, &'static str)> {
        self.produces().into_iter().map(|id| (id, "")).collect()
    }
}

/// Decides which branch to take.
pub trait BranchProcessor<S: FlowState>: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn decide(&self, ctx: &FlowContext) -> String;

    /// Like `requires()` but also returns a human-readable name for each TypeId.
    fn requires_named(&self) -> Vec<(TypeId, &'static str)> {
        self.requires().into_iter().map(|id| (id, "")).collect()
    }
}

/// A single transition in the flow definition.
#[derive(Clone)]
pub struct Transition<S: FlowState> {
    pub from: S,
    pub to: S,
    pub transition_type: TransitionType,
    pub processor: Option<Arc<dyn StateProcessor<S>>>,
    pub guard: Option<Arc<dyn TransitionGuard<S>>>,
    pub branch: Option<Arc<dyn BranchProcessor<S>>>,
    pub branch_targets: HashMap<String, S>,
    /// Label assigned by builder .to(target, label, processor). Used for branch label-specific processor matching.
    pub branch_label: Option<String>,
    pub sub_flow: Option<crate::sub_flow::SubFlowConfig<S>>,
    /// Per-state timeout. If set, resumeAndExecute checks this before guard.
    pub timeout: Option<std::time::Duration>,
}
