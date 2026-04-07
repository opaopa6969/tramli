use std::sync::Arc;
use std::time::Instant;

use crate::context::FlowContext;
use crate::definition::FlowDefinition;
use crate::error::FlowError;
use crate::instance::FlowInstance;
use crate::store::InMemoryFlowStore;
use crate::types::*;

const MAX_CHAIN_DEPTH: usize = 10;

/// Generic engine that drives all flow state machines.
///
/// Intentionally synchronous — state transitions take microseconds.
/// Async I/O happens outside the engine via External transitions.
/// See `docs/async-integration.md` for the pattern.
pub struct FlowEngine<S: FlowState> {
    pub store: InMemoryFlowStore<S>,
}

impl<S: FlowState> FlowEngine<S> {
    pub fn new(store: InMemoryFlowStore<S>) -> Self { Self { store } }

    pub fn start_flow(
        &mut self, definition: Arc<FlowDefinition<S>>,
        session_id: &str,
        initial_data: Vec<(std::any::TypeId, Box<dyn crate::CloneAny>)>,
    ) -> Result<String, FlowError> {
        let flow_id = format!("{:016x}", rand_id());
        let mut ctx = FlowContext::new(flow_id.clone());
        for (type_id, value) in initial_data { ctx.put_raw(type_id, value); }
        let initial = definition.initial_state()
            .ok_or_else(|| FlowError::new("INVALID_FLOW_DEFINITION", "No initial state"))?;
        let expires_at = Instant::now() + definition.ttl;
        let flow = FlowInstance::new(flow_id.clone(), session_id.to_string(), definition, ctx, initial, expires_at);
        self.store.create(flow);
        self.execute_auto_chain(&flow_id)?;
        Ok(flow_id)
    }

    pub fn resume_and_execute(
        &mut self, flow_id: &str,
        external_data: Vec<(std::any::TypeId, Box<dyn crate::CloneAny>)>,
    ) -> Result<(), FlowError> {
        // Phase 1: operate on flow, collect transition info
        let transition_info = {
            let flow = self.store.get_mut(flow_id)
                .ok_or_else(|| FlowError::new("FLOW_NOT_FOUND", format!("Flow {flow_id} not found or completed")))?;

            for (tid, val) in external_data { flow.context.put_raw(tid, val); }

            if Instant::now() > flow.expires_at {
                flow.complete("EXPIRED");
                return Ok(());
            }

            let current = flow.current_state();
            let def = flow.definition.clone();
            let transition = def.external_from(current)
                .ok_or_else(|| FlowError::invalid_transition(&format!("{:?}", current), &format!("{:?}", current)))?;

            if let Some(guard) = &transition.guard {
                let output = guard.validate(&flow.context);
                match output {
                    GuardOutput::Accepted { data } => {
                        for (k, v) in data { flow.context.put_raw(k, v); }
                        let to = transition.to;
                        if let Some(proc) = &transition.processor {
                            if proc.process(&mut flow.context).is_err() {
                                Self::handle_error(flow, current, &def);
                                Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string()))
                            } else {
                                let from_dbg = format!("{:?}", current);
                                flow.transition_to(to);
                                Some((from_dbg, format!("{:?}", to), guard.name().to_string()))
                            }
                        } else {
                            let from_dbg = format!("{:?}", current);
                            flow.transition_to(to);
                            Some((from_dbg, format!("{:?}", to), guard.name().to_string()))
                        }
                    }
                    GuardOutput::Rejected { .. } => {
                        flow.increment_guard_failure();
                        if flow.guard_failure_count() >= def.max_guard_retries {
                            Self::handle_error(flow, current, &def);
                            Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string()))
                        } else {
                            None
                        }
                    }
                    GuardOutput::Expired => {
                        flow.complete("EXPIRED");
                        None
                    }
                }
            } else {
                let from_dbg = format!("{:?}", current);
                let to = transition.to;
                flow.transition_to(to);
                Some((from_dbg, format!("{:?}", to), "external".to_string()))
            }
        }; // flow borrow ends here

        // Phase 2: record transition (no flow borrow)
        if let Some((from, to, trigger)) = &transition_info {
            self.store.record_transition(flow_id, from, to, trigger);
        }

        // Phase 3: auto chain (only if we transitioned successfully)
        if transition_info.is_some() {
            // Check if the transition was an error — don't auto-chain after error
            if let Some((_, _, ref trigger)) = transition_info {
                if trigger != "error" {
                    self.execute_auto_chain(flow_id)?;
                }
            }
        }
        Ok(())
    }

    fn execute_auto_chain(&mut self, flow_id: &str) -> Result<(), FlowError> {
        let mut depth = 0;
        while depth < MAX_CHAIN_DEPTH {
            // Phase 1: operate on flow, collect result
            let step_result = {
                let flow = match self.store.get_mut(flow_id) { Some(f) => f, None => break };
                let current = flow.current_state();
                if current.is_terminal() { flow.complete(format!("{:?}", current)); break; }

                let def = flow.definition.clone();

                // Check for sub-flow transition first
                let sub_flow_t = def.transitions.iter()
                    .find(|t| t.from == current && t.transition_type == TransitionType::SubFlow);
                if let Some(sft) = sub_flow_t {
                    if let Some(ref config) = sft.sub_flow {
                        let result = config.runner.start(&mut flow.context)?;
                        if let Some(exit_name) = result {
                            if let Some(&target) = config.exit_mappings.get(&exit_name) {
                                let from_dbg = format!("{:?}", current);
                                flow.transition_to(target);
                                Some((from_dbg, format!("{:?}", target),
                                    format!("subFlow:{}/{}", config.runner.name(), exit_name), false))
                            } else {
                                // Error bubbling: no exit mapping → parent error
                                Self::handle_error(flow, current, &def);
                                Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true))
                            }
                        } else { break } // sub-flow stopped at external
                    } else { break }
                } else {

                let auto_t = def.transitions.iter()
                    .find(|t| t.from == current && (t.transition_type == TransitionType::Auto || t.transition_type == TransitionType::Branch));
                let Some(t) = auto_t else { break };

                if t.transition_type == TransitionType::Auto {
                    if let Some(proc) = &t.processor {
                        if proc.process(&mut flow.context).is_err() {
                            Self::handle_error(flow, current, &def);
                            Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true))
                        } else {
                            let from_dbg = format!("{:?}", current);
                            let to = t.to;
                            let trigger = proc.name().to_string();
                            flow.transition_to(to);
                            Some((from_dbg, format!("{:?}", to), trigger, false))
                        }
                    } else {
                        let from_dbg = format!("{:?}", current);
                        let to = t.to;
                        flow.transition_to(to);
                        Some((from_dbg, format!("{:?}", to), "auto".to_string(), false))
                    }
                } else if let Some(branch) = &t.branch {
                    let label = branch.decide(&flow.context);
                    if let Some(&target) = t.branch_targets.get(&label) {
                        let from_dbg = format!("{:?}", current);
                        flow.transition_to(target);
                        Some((from_dbg, format!("{:?}", target), format!("{}:{}", branch.name(), label), false))
                    } else {
                        Self::handle_error(flow, current, &def);
                        Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true))
                    }
                } else {
                    break
                }
                } // close the else block for sub-flow check
            }; // flow borrow ends

            // Phase 2: record + check if we should stop
            if let Some((from, to, trigger, is_error)) = step_result {
                self.store.record_transition(flow_id, &from, &to, &trigger);
                if is_error { return Ok(()); }
            } else {
                break;
            }
            depth += 1;
        }
        if depth >= MAX_CHAIN_DEPTH { return Err(FlowError::max_chain_depth()); }
        Ok(())
    }

    fn handle_error(flow: &mut FlowInstance<S>, from_state: S, def: &FlowDefinition<S>) {
        if let Some(&err_target) = def.error_transitions.get(&from_state) {
            flow.transition_to(err_target);
            if err_target.is_terminal() { flow.complete(format!("{:?}", err_target)); }
        } else {
            flow.complete("TERMINAL_ERROR");
        }
    }
}

fn rand_id() -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::SystemTime;
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut h = DefaultHasher::new();
    SystemTime::now().hash(&mut h);
    COUNTER.fetch_add(1, Ordering::Relaxed).hash(&mut h);
    h.finish()
}
