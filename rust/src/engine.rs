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
    pub strict_mode: bool,
}

impl<S: FlowState> FlowEngine<S> {
    pub fn new(store: InMemoryFlowStore<S>) -> Self { Self { store, strict_mode: false } }
    pub fn with_strict_mode(store: InMemoryFlowStore<S>) -> Self { Self { store, strict_mode: true } }

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

                // Step dispatch: SubFlow > Auto > Branch > External(stop)
                Self::dispatch_step(flow, current, &def, self.strict_mode)?
            }; // flow borrow ends

            // Phase 2: record + check if we should stop
            let Some((from, to, trigger, is_error)) = step_result else { break };
            self.store.record_transition(flow_id, &from, &to, &trigger);
            if is_error { return Ok(()); }
            depth += 1;
        }
        if depth >= MAX_CHAIN_DEPTH { return Err(FlowError::max_chain_depth()); }
        Ok(())
    }

    /// Dispatch one auto-chain step. Returns (from, to, trigger, is_error) or None to stop.
    fn dispatch_step(
        flow: &mut FlowInstance<S>, current: S, def: &FlowDefinition<S>, strict_mode: bool,
    ) -> Result<Option<(String, String, String, bool)>, FlowError> {
        // 1. SubFlow
        if let Some(sft) = def.transitions.iter().find(|t| t.from == current && t.transition_type == TransitionType::SubFlow) {
            if let Some(ref config) = sft.sub_flow {
                use crate::sub_flow::SubFlowResult;
                let mut instance = config.runner.create_instance();
                return match instance.start(&mut flow.context)? {
                    SubFlowResult::Completed(exit_name) => {
                        if let Some(&target) = config.exit_mappings.get(&exit_name) {
                            let from_dbg = format!("{:?}", current);
                            flow.transition_to(target);
                            Ok(Some((from_dbg, format!("{:?}", target),
                                format!("subFlow:{}/{}", config.runner.name(), exit_name), false)))
                        } else {
                            Self::handle_error(flow, current, def);
                            Ok(Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true)))
                        }
                    }
                    SubFlowResult::WaitingAtExternal | SubFlowResult::GuardRejected(_) => Ok(None),
                };
            }
            return Ok(None);
        }

        // 2. Auto
        if let Some(t) = def.transitions.iter().find(|t| t.from == current && t.transition_type == TransitionType::Auto) {
            if let Some(proc) = &t.processor {
                let result = proc.process(&mut flow.context);
                let strict_fail = result.is_ok() && strict_mode &&
                    proc.produces().iter().any(|p| !flow.context.has_type_id(p));
                if result.is_err() || strict_fail {
                    Self::handle_error(flow, current, def);
                    return Ok(Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true)));
                }
                let from_dbg = format!("{:?}", current);
                flow.transition_to(t.to);
                return Ok(Some((from_dbg, format!("{:?}", t.to), proc.name().to_string(), false)));
            }
            let from_dbg = format!("{:?}", current);
            flow.transition_to(t.to);
            return Ok(Some((from_dbg, format!("{:?}", t.to), "auto".to_string(), false)));
        }

        // 3. Branch
        if let Some(t) = def.transitions.iter().find(|t| t.from == current && t.transition_type == TransitionType::Branch) {
            if let Some(branch) = &t.branch {
                let label = branch.decide(&flow.context);
                if let Some(&target) = t.branch_targets.get(&label) {
                    let from_dbg = format!("{:?}", current);
                    flow.transition_to(target);
                    return Ok(Some((from_dbg, format!("{:?}", target), format!("{}:{}", branch.name(), label), false)));
                }
                Self::handle_error(flow, current, def);
                return Ok(Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true)));
            }
        }

        // No auto/branch/subflow — stop
        Ok(None)
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
