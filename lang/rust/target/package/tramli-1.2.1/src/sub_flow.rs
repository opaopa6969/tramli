use std::collections::HashMap;
use crate::context::FlowContext;
use crate::error::FlowError;

/// Type-erased sub-flow interface for embedding in parent FlowDefinition.
/// Allows parent flow to use a sub-flow with a different state enum type.
pub trait SubFlowRunner: Send + Sync {
    /// Name of the sub-flow definition.
    fn name(&self) -> &str;

    /// Terminal state names.
    fn terminal_names(&self) -> Vec<String>;

    /// Run auto-chain from initial state. Returns exit state name if completed,
    /// None if stopped at external.
    fn start(&self, ctx: &mut FlowContext) -> Result<Option<String>, FlowError>;

    /// Resume from external transition. Returns exit state name if completed,
    /// None if stopped at another external.
    fn resume(&self, ctx: &mut FlowContext) -> Result<Option<String>, FlowError>;
}

/// Configuration for a sub-flow transition: the sub-flow runner + exit mappings.
pub struct SubFlowConfig<S> {
    pub runner: Box<dyn SubFlowRunner>,
    pub exit_mappings: HashMap<String, S>,
}

use std::sync::Arc;
use crate::definition::FlowDefinition;
use crate::types::*;

/// Wraps a FlowDefinition<T> as a SubFlowRunner for embedding in a parent flow.
pub struct SubFlowAdapter<T: FlowState> {
    pub definition: Arc<FlowDefinition<T>>,
    current_state: std::sync::Mutex<Option<T>>,
}

impl<T: FlowState> SubFlowAdapter<T> {
    pub fn new(definition: Arc<FlowDefinition<T>>) -> Self {
        Self { definition, current_state: std::sync::Mutex::new(None) }
    }
}

impl<T: FlowState> SubFlowRunner for SubFlowAdapter<T> {
    fn name(&self) -> &str { &self.definition.name }

    fn terminal_names(&self) -> Vec<String> {
        self.definition.terminal_states().iter().map(|s| format!("{:?}", s)).collect()
    }

    fn start(&self, ctx: &mut FlowContext) -> Result<Option<String>, FlowError> {
        let initial = self.definition.initial_state()
            .ok_or_else(|| FlowError::new("INVALID_FLOW_DEFINITION", "Sub-flow has no initial state"))?;
        *self.current_state.lock().unwrap() = Some(initial);
        self.run_auto_chain(ctx)
    }

    fn resume(&self, ctx: &mut FlowContext) -> Result<Option<String>, FlowError> {
        let current = self.current_state.lock().unwrap().ok_or_else(||
            FlowError::new("INVALID_STATE", "Sub-flow not started"))?;

        // Find external transition
        let ext = self.definition.transitions.iter()
            .find(|t| t.from == current && t.transition_type == TransitionType::External);
        let Some(t) = ext else {
            return Err(FlowError::new("INVALID_TRANSITION",
                format!("No external transition from sub-flow state {:?}", current)));
        };

        // Validate guard
        if let Some(guard) = &t.guard {
            let output = guard.validate(ctx);
            match output {
                GuardOutput::Accepted { data } => {
                    for (k, v) in data { ctx.put_raw(k, v); }
                    *self.current_state.lock().unwrap() = Some(t.to);
                }
                GuardOutput::Rejected { .. } => { return Ok(None); }
                GuardOutput::Expired => { return Ok(Some("EXPIRED".to_string())); }
            }
        } else {
            *self.current_state.lock().unwrap() = Some(t.to);
        }

        self.run_auto_chain(ctx)
    }
}

impl<T: FlowState> SubFlowAdapter<T> {
    fn run_auto_chain(&self, ctx: &mut FlowContext) -> Result<Option<String>, FlowError> {
        let mut depth = 0;
        while depth < 10 {
            let current = self.current_state.lock().unwrap().unwrap();
            if current.is_terminal() {
                return Ok(Some(format!("{:?}", current)));
            }

            let auto_t = self.definition.transitions.iter()
                .find(|t| t.from == current && (t.transition_type == TransitionType::Auto || t.transition_type == TransitionType::Branch));
            let Some(t) = auto_t else { break };

            if t.transition_type == TransitionType::Auto {
                if let Some(proc) = &t.processor {
                    if proc.process(ctx).is_err() {
                        return Ok(Some("ERROR".to_string()));
                    }
                }
                *self.current_state.lock().unwrap() = Some(t.to);
            } else {
                break; // branch in sub-flow not yet supported in MVP
            }
            depth += 1;
        }

        // Check if stopped at external
        let current = self.current_state.lock().unwrap().unwrap();
        let has_external = self.definition.transitions.iter()
            .any(|t| t.from == current && t.transition_type == TransitionType::External);
        if has_external {
            return Ok(None); // stopped at external
        }

        Ok(None)
    }
}

