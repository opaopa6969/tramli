use std::collections::HashMap;
use std::sync::{Arc, Mutex};
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

/// Type-erased sub-flow interface for embedding in parent FlowDefinition.
pub trait SubFlowRunner: Send + Sync {
    fn name(&self) -> &str;
    fn terminal_names(&self) -> Vec<String>;
    /// Start from initial state, run auto-chain.
    fn start(&self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError>;
    /// Resume from external, run auto-chain.
    fn resume(&self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError>;
    /// Current state name (for observability).
    fn current_state_name(&self) -> Option<String>;
}

/// Configuration for a sub-flow transition.
pub struct SubFlowConfig<S> {
    pub runner: Box<dyn SubFlowRunner>,
    pub exit_mappings: HashMap<String, S>,
}

/// Wraps a FlowDefinition<T> as a SubFlowRunner.
pub struct SubFlowAdapter<T: FlowState> {
    definition: Arc<FlowDefinition<T>>,
    state: Mutex<Option<T>>,
    guard_failure_count: Mutex<usize>,
}

impl<T: FlowState> SubFlowAdapter<T> {
    pub fn new(definition: Arc<FlowDefinition<T>>) -> Self {
        Self {
            definition,
            state: Mutex::new(None),
            guard_failure_count: Mutex::new(0),
        }
    }

    fn current(&self) -> Option<T> {
        *self.state.lock().unwrap()
    }

    fn set_state(&self, s: T) {
        *self.state.lock().unwrap() = Some(s);
    }

    fn run_auto_chain(&self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let mut depth = 0;
        while depth < 10 {
            let current = self.current().unwrap();
            if current.is_terminal() {
                return Ok(SubFlowResult::Completed(format!("{:?}", current)));
            }

            // Auto transition
            let auto_t = self.definition.transitions.iter()
                .find(|t| t.from == current && t.transition_type == TransitionType::Auto);
            if let Some(t) = auto_t {
                if let Some(proc) = &t.processor {
                    if let Err(e) = proc.process(ctx) {
                        // Error — check sub-flow's error transitions
                        if let Some(&err_target) = self.definition.error_transitions.get(&current) {
                            self.set_state(err_target);
                            if err_target.is_terminal() {
                                return Ok(SubFlowResult::Completed(format!("{:?}", err_target)));
                            }
                            depth += 1;
                            continue;
                        }
                        // No error transition — bubble up as error terminal
                        return Ok(SubFlowResult::Completed(format!("ERROR:{}", e)));
                    }
                }
                self.set_state(t.to);
                depth += 1;
                continue;
            }

            // Branch transition
            let branch_t = self.definition.transitions.iter()
                .find(|t| t.from == current && t.transition_type == TransitionType::Branch);
            if let Some(t) = branch_t {
                if let Some(branch) = &t.branch {
                    let label = branch.decide(ctx);
                    if let Some(&target) = t.branch_targets.get(&label) {
                        self.set_state(target);
                        depth += 1;
                        continue;
                    }
                    // Unknown label — error
                    return Ok(SubFlowResult::Completed("ERROR:unknown_branch".to_string()));
                }
            }

            // External transition — stop and wait
            let has_external = self.definition.transitions.iter()
                .any(|t| t.from == current && t.transition_type == TransitionType::External);
            if has_external {
                return Ok(SubFlowResult::WaitingAtExternal);
            }

            break; // no transition found
        }
        if depth >= 10 {
            return Err(FlowError::max_chain_depth());
        }
        Ok(SubFlowResult::WaitingAtExternal)
    }
}

impl<T: FlowState> SubFlowRunner for SubFlowAdapter<T> {
    fn name(&self) -> &str { &self.definition.name }

    fn terminal_names(&self) -> Vec<String> {
        self.definition.terminal_states().iter().map(|s| format!("{:?}", s)).collect()
    }

    fn current_state_name(&self) -> Option<String> {
        self.current().map(|s| format!("{:?}", s))
    }

    fn start(&self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let initial = self.definition.initial_state()
            .ok_or_else(|| FlowError::new("INVALID_FLOW_DEFINITION", "Sub-flow has no initial state"))?;
        self.set_state(initial);
        *self.guard_failure_count.lock().unwrap() = 0;
        self.run_auto_chain(ctx)
    }

    fn resume(&self, ctx: &mut FlowContext) -> Result<SubFlowResult, FlowError> {
        let current = self.current().ok_or_else(||
            FlowError::new("INVALID_STATE", "Sub-flow not started"))?;

        let ext = self.definition.transitions.iter()
            .find(|t| t.from == current && t.transition_type == TransitionType::External)
            .ok_or_else(|| FlowError::new("INVALID_TRANSITION",
                format!("No external transition from sub-flow state {:?}", current)))?;

        if let Some(guard) = &ext.guard {
            match guard.validate(ctx) {
                GuardOutput::Accepted { data } => {
                    for (k, v) in data { ctx.put_raw(k, v); }
                    // Run processor if present
                    if let Some(proc) = &ext.processor {
                        if let Err(e) = proc.process(ctx) {
                            if let Some(&err_target) = self.definition.error_transitions.get(&current) {
                                self.set_state(err_target);
                                if err_target.is_terminal() {
                                    return Ok(SubFlowResult::Completed(format!("{:?}", err_target)));
                                }
                            }
                            return Ok(SubFlowResult::Completed(format!("ERROR:{}", e)));
                        }
                    }
                    self.set_state(ext.to);
                }
                GuardOutput::Rejected { reason } => {
                    let mut count = self.guard_failure_count.lock().unwrap();
                    *count += 1;
                    if *count >= self.definition.max_guard_retries {
                        if let Some(&err_target) = self.definition.error_transitions.get(&current) {
                            self.set_state(err_target);
                            if err_target.is_terminal() {
                                return Ok(SubFlowResult::Completed(format!("{:?}", err_target)));
                            }
                        }
                        return Ok(SubFlowResult::Completed("ERROR:max_retries".to_string()));
                    }
                    return Ok(SubFlowResult::GuardRejected(reason));
                }
                GuardOutput::Expired => {
                    return Ok(SubFlowResult::Completed("EXPIRED".to_string()));
                }
            }
        } else {
            self.set_state(ext.to);
        }

        self.run_auto_chain(ctx)
    }
}
