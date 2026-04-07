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
        eprintln!("[engine] creating context");
        let mut ctx = FlowContext::new(flow_id.clone());
        for (type_id, value) in initial_data { ctx.put_raw(type_id, value); }
        let initial = definition.initial_state()
            .ok_or_else(|| FlowError::new("INVALID_FLOW_DEFINITION", "No initial state"))?;
        let expires_at = Instant::now() + definition.ttl;
        let flow = FlowInstance::new(flow_id.clone(), session_id.to_string(), definition, ctx, initial, expires_at);
        eprintln!("[engine] storing flow");
        self.store.create(flow);
        eprintln!("[engine] executing auto chain");
        self.execute_auto_chain(&flow_id)?;
        eprintln!("[engine] done");
        Ok(flow_id)
    }

    pub fn resume_and_execute(
        &mut self, flow_id: &str,
        external_data: Vec<(std::any::TypeId, Box<dyn crate::CloneAny>)>,
    ) -> Result<(), FlowError> {
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
                    let backup = flow.context.snapshot();
                    for (k, v) in data { flow.context.put_raw(k, v); }
                    let to = transition.to;
                    if let Some(proc) = &transition.processor {
                        if proc.process(&mut flow.context).is_err() {
                            flow.context.restore_from(backup);
                            Self::handle_error(flow, current, &def);
                            return Ok(());
                        }
                    }
                    flow.transition_to(to);
                }
                GuardOutput::Rejected { .. } => {
                    flow.increment_guard_failure();
                    if flow.guard_failure_count() >= def.max_guard_retries {
                        Self::handle_error(flow, current, &def);
                    }
                    return Ok(());
                }
                GuardOutput::Expired => {
                    flow.complete("EXPIRED");
                    return Ok(());
                }
            }
        } else {
            flow.transition_to(transition.to);
        }

        self.execute_auto_chain(flow_id)?;
        Ok(())
    }

    fn execute_auto_chain(&mut self, flow_id: &str) -> Result<(), FlowError> {
        eprintln!("[auto_chain] enter");
        let mut depth = 0;
        while depth < MAX_CHAIN_DEPTH {
            eprintln!("[auto_chain] depth={}", depth);
            let flow = match self.store.get_mut(flow_id) { Some(f) => f, None => break };
            let current = flow.current_state();
            if current.is_terminal() { flow.complete(format!("{:?}", current)); break; }

            let def = flow.definition.clone();
            let auto_t = def.transitions.iter()
                .find(|t| t.from == current && (t.transition_type == TransitionType::Auto || t.transition_type == TransitionType::Branch));
            let Some(t) = auto_t else { break };

            // let backup = flow.context.snapshot();  // temporarily disabled
            if t.transition_type == TransitionType::Auto {
                if let Some(proc) = &t.processor {
                    if proc.process(&mut flow.context).is_err() {
                        // flow.context.restore_from(backup);
                        Self::handle_error(flow, current, &def);
                        return Ok(());
                    }
                }
                flow.transition_to(t.to);
            } else if let Some(branch) = &t.branch {
                let label = branch.decide(&flow.context);
                if let Some(&target) = t.branch_targets.get(&label) {
                    flow.transition_to(target);
                } else {
                    // flow.context.restore_from(backup);
                    Self::handle_error(flow, current, &def);
                    return Ok(());
                }
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
    use std::time::SystemTime;
    let mut h = DefaultHasher::new();
    SystemTime::now().hash(&mut h);
    std::thread::current().id().hash(&mut h);
    h.finish()
}
