use std::any::TypeId;
use std::collections::HashMap;
use std::fmt::Debug;
use std::hash::Hash;

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
pub enum TransitionType { Auto, External, Branch }

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
}

/// Guards an external transition. Must not mutate FlowContext.
pub trait TransitionGuard<S: FlowState>: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn produces(&self) -> Vec<TypeId>;
    fn validate(&self, ctx: &FlowContext) -> GuardOutput;
}

/// Decides which branch to take.
pub trait BranchProcessor<S: FlowState>: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn decide(&self, ctx: &FlowContext) -> String;
}

/// A single transition in the flow definition.
pub struct Transition<S: FlowState> {
    pub from: S,
    pub to: S,
    pub transition_type: TransitionType,
    pub processor: Option<Box<dyn StateProcessor<S>>>,
    pub guard: Option<Box<dyn TransitionGuard<S>>>,
    pub branch: Option<Box<dyn BranchProcessor<S>>>,
    pub branch_targets: HashMap<String, S>,
}
