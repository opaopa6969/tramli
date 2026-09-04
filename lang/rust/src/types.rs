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
pub enum TransitionType {
    Auto,
    External,
    Branch,
    SubFlow,
}

/// Guard output.
pub enum GuardOutput {
    Accepted {
        data: HashMap<TypeId, Box<dyn CloneAny>>,
    },
    Rejected {
        reason: String,
    },
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

    /// Routing type set by `external_on`. It is separate from data dependencies.
    fn external_trigger(&self) -> Option<TypeId> {
        None
    }

    /// Human-readable name for `external_trigger` diagnostics and diagrams.
    fn external_trigger_name(&self) -> Option<&'static str> {
        None
    }

    /// Like `requires()` but also returns a human-readable name for each TypeId.
    fn requires_named(&self) -> Vec<(TypeId, &'static str)> {
        self.requires().into_iter().map(|id| (id, "")).collect()
    }

    /// Like `produces()` but also returns a human-readable name for each TypeId.
    fn produces_named(&self) -> Vec<(TypeId, &'static str)> {
        self.produces().into_iter().map(|id| (id, "")).collect()
    }
}

pub(crate) fn select_external_transition<'a, S: FlowState>(
    externals: &[&'a Transition<S>],
    data_types: &std::collections::HashSet<TypeId>,
    state_name: &str,
) -> Result<&'a Transition<S>, FlowError> {
    let explicit: Vec<_> = externals
        .iter()
        .filter(|transition| {
            transition
                .guard
                .as_ref()
                .is_some_and(|guard| guard.external_trigger().is_some())
        })
        .copied()
        .collect();
    if !explicit.is_empty() {
        let matches: Vec<_> = explicit
            .into_iter()
            .filter(|transition| {
                transition
                    .guard
                    .as_ref()
                    .and_then(|guard| guard.external_trigger())
                    .is_some_and(|trigger| data_types.contains(&trigger))
            })
            .collect();
        return match matches.len() {
            1 => Ok(matches[0]),
            0 => Err(FlowError::new(
                "EXTERNAL_EVENT_NOT_MATCHED",
                format!("External event did not match a trigger at state {state_name}"),
            )),
            _ => Err(FlowError::new(
                "EXTERNAL_EVENT_AMBIGUOUS",
                format!("External event matched multiple triggers at state {state_name}"),
            )),
        };
    }

    if externals.len() == 1 {
        return Ok(externals[0]);
    }
    let matches: Vec<_> = externals
        .iter()
        .filter(|transition| {
            transition.guard.as_ref().is_some_and(|guard| {
                guard
                    .requires()
                    .iter()
                    .all(|required| data_types.contains(required))
            })
        })
        .copied()
        .collect();
    let Some(specificity) = matches
        .iter()
        .filter_map(|transition| {
            transition
                .guard
                .as_ref()
                .map(|guard| guard.requires().len())
        })
        .max()
    else {
        return Err(FlowError::new(
            "EXTERNAL_EVENT_NOT_MATCHED",
            format!("External event did not satisfy any guard requirements at state {state_name}"),
        ));
    };
    let most_specific: Vec<_> = matches
        .into_iter()
        .filter(|transition| {
            transition
                .guard
                .as_ref()
                .is_some_and(|guard| guard.requires().len() == specificity)
        })
        .collect();
    if most_specific.len() != 1 {
        return Err(FlowError::new(
            "EXTERNAL_EVENT_AMBIGUOUS",
            format!(
                "External event matched multiple equally specific guards at state {state_name}"
            ),
        ));
    }
    Ok(most_specific[0])
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
