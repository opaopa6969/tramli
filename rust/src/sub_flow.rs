use std::collections::HashMap;
use std::sync::Arc;
use crate::context::FlowContext;
use crate::error::FlowError;
use crate::definition::FlowDefinition;
use crate::types::*;

/// Result of a sub-flow step.
pub enum SubFlowResult {
    /// Sub-flow reached a terminal state.
    Completed(String),
    /// Sub-flow is waiting at an external transition.
    WaitingAtExternal,
    /// Guard rejected (flow stays, retry possible).
    GuardRejected(String),
}

/// Factory for creating sub-flow instances. Stateless — safe to share via Arc.
pub trait SubFlowRunner: Send + Sync {
    fn name(&self) -> &str;
    fn terminal_names(&self) -> Vec<String>;
    /// Max nesting depth contributed by this sub-flow (for validation).
    fn nesting_depth(&self) -> usize { 1 }
    /// Create a new sub-flow instance (with its own state).
    fn create_instance(&self) -> Box<dyn SubFlowInstance>;
}

/// A running sub-flow instance. Owns its state — NOT shared between flows.
pub trait SubFlowInstance: Send {
    fn current_state_name(&self) -> Option<String>;
    fn start(&mut self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError>;
    fn resume(&mut self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError>;
}

/// Configuration for a sub-flow transition.
pub struct SubFlowConfig<S> {
    pub runner: Box<dyn SubFlowRunner>,
    pub exit_mappings: HashMap<String, S>,
}

// ─── SubFlowAdapter: wraps FlowDefinition<T> as SubFlowRunner ───

pub struct SubFlowAdapter<T: FlowState> {
    definition: Arc<FlowDefinition<T>>,
}

impl<T: FlowState> SubFlowAdapter<T> {
    pub fn new(definition: Arc<FlowDefinition<T>>) -> Self {
        Self { definition }
    }
}

impl<T: FlowState> SubFlowRunner for SubFlowAdapter<T> {
    fn name(&self) -> &str { &self.definition.name }

    fn terminal_names(&self) -> Vec<String> {
        self.definition.terminal_states().iter().map(|s| format!("{:?}", s)).collect()
    }

    fn create_instance(&self) -> Box<dyn SubFlowInstance> {
        Box::new(SubFlowAdapterInstance {
            definition: self.definition.clone(),
            state: None,
            guard_failure_count: 0,
        })
    }
}

// ─── SubFlowAdapterInstance: owns state for one execution ───

struct SubFlowAdapterInstance<T: FlowState> {
    definition: Arc<FlowDefinition<T>>,
    state: Option<T>,
    guard_failure_count: usize,
}

impl<T: FlowState> SubFlowInstance for SubFlowAdapterInstance<T> {
    fn current_state_name(&self) -> Option<String> {
        self.state.map(|s| format!("{:?}", s))
    }

    fn start(&mut self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let initial = self.definition.initial_state()
            .ok_or_else(|| FlowError::new("INVALID_FLOW_DEFINITION", "Sub-flow has no initial state"))?;
        self.state = Some(initial);
        self.guard_failure_count = 0;
        self.run_auto_chain(ctx)
    }

    fn resume(&mut self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let current = self.state.ok_or_else(||
            FlowError::new("INVALID_STATE", "Sub-flow not started"))?;

        let ext = self.definition.transitions.iter()
            .find(|t| t.from == current && t.transition_type == TransitionType::External)
            .ok_or_else(|| FlowError::new("INVALID_TRANSITION",
                format!("No external transition from sub-flow state {:?}", current)))?;

        if let Some(guard) = &ext.guard {
            match guard.validate(ctx) {
                GuardOutput::Accepted { data } => {
                    for (k, v) in data { ctx.put_raw(k, v); }
                    if let Some(proc) = &ext.processor {
                        if let Err(e) = proc.process(ctx) {
                            return self.handle_error(current, e);
                        }
                    }
                    self.state = Some(ext.to);
                }
                GuardOutput::Rejected { reason } => {
                    self.guard_failure_count += 1;
                    if self.guard_failure_count >= self.definition.max_guard_retries {
                        return self.handle_error_no_cause(current);
                    }
                    return Ok(SubFlowResult::GuardRejected(reason));
                }
                GuardOutput::Expired => {
                    return Ok(SubFlowResult::Completed("EXPIRED".to_string()));
                }
            }
        } else {
            self.state = Some(ext.to);
        }

        self.run_auto_chain(ctx)
    }
}

impl<T: FlowState> SubFlowAdapterInstance<T> {
    fn run_auto_chain(&mut self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let mut depth = 0;
        while depth < 10 {
            let current = self.state.unwrap();
            if current.is_terminal() {
                return Ok(SubFlowResult::Completed(format!("{:?}", current)));
            }

            // Auto transition
            if let Some(t) = self.definition.transitions.iter()
                .find(|t| t.from == current && t.transition_type == TransitionType::Auto)
            {
                if let Some(proc) = &t.processor {
                    if let Err(e) = proc.process(ctx) {
                        return self.handle_error(current, e);
                    }
                }
                self.state = Some(t.to);
                depth += 1;
                continue;
            }

            // Branch transition
            if let Some(t) = self.definition.transitions.iter()
                .find(|t| t.from == current && t.transition_type == TransitionType::Branch)
            {
                if let Some(branch) = &t.branch {
                    let label = branch.decide(ctx);
                    if let Some(&target) = t.branch_targets.get(&label) {
                        self.state = Some(target);
                        depth += 1;
                        continue;
                    }
                    return Ok(SubFlowResult::Completed("ERROR:unknown_branch".to_string()));
                }
            }

            // External — stop
            if self.definition.transitions.iter()
                .any(|t| t.from == current && t.transition_type == TransitionType::External)
            {
                return Ok(SubFlowResult::WaitingAtExternal);
            }

            break;
        }
        if depth >= 10 {
            return Err(FlowError::max_chain_depth());
        }
        Ok(SubFlowResult::WaitingAtExternal)
    }

    fn handle_error(&mut self, current: T, _cause: FlowError) -> Result<SubFlowResult, FlowError> {
        if let Some(&err_target) = self.definition.error_transitions.get(&current) {
            self.state = Some(err_target);
            if err_target.is_terminal() {
                return Ok(SubFlowResult::Completed(format!("{:?}", err_target)));
            }
        }
        Ok(SubFlowResult::Completed("ERROR".to_string()))
    }

    fn handle_error_no_cause(&mut self, current: T) -> Result<SubFlowResult, FlowError> {
        self.handle_error(current, FlowError::new("MAX_RETRIES", "Guard max retries exceeded"))
    }
}
