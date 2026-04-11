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
/// Log entry for transitions.
pub struct TransitionLogEntry {
    pub flow_id: String,
    pub flow_name: String,
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub duration_micros: u64,
}

/// Log entry for errors.
pub struct ErrorLogEntry {
    pub flow_id: String,
    pub flow_name: String,
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub cause: Option<String>,
    pub duration_micros: u64,
}

/// Log entry for state changes (context.put). Opt-in for debugging.
pub struct StateLogEntry {
    pub flow_id: String,
    pub flow_name: String,
    pub state: String,
    pub key: String,
    pub value: String,
}

/// Log entry for guard results.
pub struct GuardLogEntry {
    pub flow_id: String,
    pub flow_name: String,
    pub state: String,
    pub guard_name: String,
    pub result: &'static str,
    pub reason: Option<String>,
    pub duration_micros: u64,
}

pub struct FlowEngine<S: FlowState> {
    pub store: InMemoryFlowStore<S>,
    pub strict_mode: bool,
    max_chain_depth: usize,
    transition_logger: Option<Box<dyn Fn(&TransitionLogEntry) + Send + Sync>>,
    state_logger: Option<Box<dyn Fn(&StateLogEntry) + Send + Sync>>,
    error_logger: Option<Box<dyn Fn(&ErrorLogEntry) + Send + Sync>>,
    guard_logger: Option<Box<dyn Fn(&GuardLogEntry) + Send + Sync>>,
}

impl<S: FlowState> FlowEngine<S> {
    pub fn new(store: InMemoryFlowStore<S>) -> Self {
        Self { store, strict_mode: false, max_chain_depth: MAX_CHAIN_DEPTH, transition_logger: None, state_logger: None, error_logger: None, guard_logger: None }
    }
    pub fn with_options(store: InMemoryFlowStore<S>, strict_mode: bool, max_chain_depth: usize) -> Self {
        Self { store, strict_mode, max_chain_depth, transition_logger: None, state_logger: None, error_logger: None, guard_logger: None }
    }
    pub fn with_strict_mode(store: InMemoryFlowStore<S>) -> Self {
        Self { store, strict_mode: true, max_chain_depth: MAX_CHAIN_DEPTH, transition_logger: None, state_logger: None, error_logger: None, guard_logger: None }
    }

    pub fn set_transition_logger(&mut self, logger: impl Fn(&TransitionLogEntry) + Send + Sync + 'static) {
        self.transition_logger = Some(Box::new(logger));
    }
    /// Set state logger. Called on each context.put(). Opt-in for debugging.
    pub fn set_state_logger(&mut self, logger: impl Fn(&StateLogEntry) + Send + Sync + 'static) {
        self.state_logger = Some(Box::new(logger));
    }
    pub fn set_error_logger(&mut self, logger: impl Fn(&ErrorLogEntry) + Send + Sync + 'static) {
        self.error_logger = Some(Box::new(logger));
    }
    pub fn set_guard_logger(&mut self, logger: impl Fn(&GuardLogEntry) + Send + Sync + 'static) {
        self.guard_logger = Some(Box::new(logger));
    }
    pub fn remove_all_loggers(&mut self) {
        self.transition_logger = None;
        self.state_logger = None;
        self.error_logger = None;
        self.guard_logger = None;
    }

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
        // Phase 1: operate on flow, collect transition info + guard info
        let phase1_start = Instant::now();
        let mut guard_info: Option<(String, String, &'static str, Option<String>)> = None; // (state, guardName, result, reason)
        // Collect external data TypeIds before consuming
        let data_type_ids: std::collections::HashSet<std::any::TypeId> =
            external_data.iter().map(|(tid, _)| *tid).collect();
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

            // Multi-external: select guard by requires matching
            let externals = def.externals_from(current);
            if externals.is_empty() {
                return Err(FlowError::invalid_transition(&format!("{:?}", current), &format!("{:?}", current)));
            }
            let transition = externals.iter()
                .find(|ext| ext.guard.as_ref().map_or(false, |g| {
                    g.requires().iter().all(|r| data_type_ids.contains(r))
                }))
                .copied()
                .unwrap_or(externals[0]);

            // Per-state timeout check
            if let Some(timeout) = transition.timeout {
                let deadline = flow.state_entered_at() + timeout;
                if Instant::now() > deadline {
                    flow.complete("EXPIRED");
                    return Ok(());
                }
            }

            if let Some(guard) = &transition.guard {
                let guard_name = guard.name().to_string();
                let output = guard.validate(&flow.context);
                match output {
                    GuardOutput::Accepted { data } => {
                        guard_info = Some((format!("{:?}", current), guard_name.clone(), "accepted", None));
                        let backup = flow.context.snapshot();
                        for (k, v) in data { flow.context.put_raw(k, v); }
                        let to = transition.to;
                        if let Some(proc) = &transition.processor {
                            match proc.process(&mut flow.context) {
                                Err(ref e) => {
                                    flow.context.restore_from(backup);
                                    Self::handle_error_with_cause(flow, current, &def, Some(e));
                                    Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string()))
                                }
                                Ok(()) => {
                                    let from_dbg = format!("{:?}", current);
                                    if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                                    flow.transition_to(to);
                                    if let Some(action) = def.enter_action(to) { action(&mut flow.context); }
                                    Some((from_dbg, format!("{:?}", to), guard.name().to_string()))
                                }
                            }
                        } else {
                            let from_dbg = format!("{:?}", current);
                            if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                            flow.transition_to(to);
                            if let Some(action) = def.enter_action(to) { action(&mut flow.context); }
                            Some((from_dbg, format!("{:?}", to), guard.name().to_string()))
                        }
                    }
                    GuardOutput::Rejected { ref reason } => {
                        guard_info = Some((format!("{:?}", current), guard_name.clone(), "rejected", Some(reason.clone())));
                        flow.increment_guard_failure_named(&guard_name);
                        if flow.guard_failure_count() >= def.max_guard_retries {
                            Self::handle_error(flow, current, &def);
                            Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string()))
                        } else {
                            None
                        }
                    }
                    GuardOutput::Expired => {
                        guard_info = Some((format!("{:?}", current), guard_name.clone(), "expired", None));
                        flow.complete("EXPIRED");
                        None
                    }
                }
            } else {
                let from_dbg = format!("{:?}", current);
                let to = transition.to;
                if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                flow.transition_to(to);
                if let Some(action) = def.enter_action(to) { action(&mut flow.context); }
                Some((from_dbg, format!("{:?}", to), "external".to_string()))
            }
        }; // flow borrow ends here

        // Phase 2: log guard result + record transition (no flow borrow)
        let phase2_elapsed = phase1_start.elapsed().as_micros() as u64;
        let flow_name = self.store.get(flow_id).map(|f| f.definition.name.clone()).unwrap_or_default();
        if let Some((ref state, ref gname, result, ref reason)) = guard_info {
            if let Some(ref logger) = self.guard_logger {
                logger(&GuardLogEntry {
                    flow_id: flow_id.to_string(), flow_name: flow_name.clone(),
                    state: state.clone(), guard_name: gname.clone(),
                    result, reason: reason.clone(), duration_micros: phase2_elapsed,
                });
            }
        }
        if let Some((ref from, ref to, ref trigger)) = transition_info {
            self.store.record_transition(flow_id, from, to, trigger);
            if let Some(ref logger) = self.transition_logger {
                logger(&TransitionLogEntry {
                    flow_id: flow_id.to_string(), flow_name: flow_name.clone(),
                    from: from.clone(), to: to.clone(), trigger: trigger.clone(),
                    duration_micros: phase2_elapsed,
                });
            }
            if trigger == "error" {
                if let Some(ref logger) = self.error_logger {
                    logger(&ErrorLogEntry {
                        flow_id: flow_id.to_string(), flow_name: flow_name.clone(),
                        from: from.clone(), to: to.clone(), trigger: trigger.clone(), cause: None,
                        duration_micros: phase2_elapsed,
                    });
                }
            }
        }

        // Phase 3: auto chain (only if we transitioned successfully)
        if transition_info.is_some() {
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
        let max_depth = self.max_chain_depth;
        while depth < max_depth {
            let step_start = Instant::now();
            // Phase 1: operate on flow, collect result
            let step_result = {
                let flow = match self.store.get_mut(flow_id) { Some(f) => f, None => break };
                let current = flow.current_state();
                if current.is_terminal() { flow.complete(format!("{:?}", current)); break; }

                let def = flow.definition.clone();

                // Step dispatch: SubFlow > Auto > Branch > External(stop)
                Self::dispatch_step(flow, current, &def, self.strict_mode)?
            }; // flow borrow ends

            // Phase 2: record + log + check if we should stop
            let Some((from, to, trigger, is_error)) = step_result else { break };
            let duration_micros = step_start.elapsed().as_micros() as u64;
            self.store.record_transition(flow_id, &from, &to, &trigger);
            let flow_name = self.store.get(flow_id).map(|f| f.definition.name.clone()).unwrap_or_default();
            if let Some(ref logger) = self.transition_logger {
                logger(&TransitionLogEntry {
                    flow_id: flow_id.to_string(), flow_name: flow_name.clone(),
                    from: from.clone(), to: to.clone(), trigger: trigger.clone(),
                    duration_micros,
                });
            }
            if is_error {
                if let Some(ref logger) = self.error_logger {
                    logger(&ErrorLogEntry {
                        flow_id: flow_id.to_string(), flow_name,
                        from, to, trigger, cause: None,
                        duration_micros,
                    });
                }
                return Ok(());
            }
            depth += 1;
        }
        if depth >= max_depth { return Err(FlowError::max_chain_depth()); }
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
                            if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                            flow.transition_to(target);
                            if let Some(action) = def.enter_action(target) { action(&mut flow.context); }
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
                let backup = flow.context.snapshot();
                let result = proc.process(&mut flow.context);
                let strict_fail = result.is_ok() && strict_mode &&
                    proc.produces().iter().any(|p| !flow.context.has_type_id(p));
                if result.is_err() || strict_fail {
                    flow.context.restore_from(backup);
                    let cause = result.err();
                    Self::handle_error_with_cause(flow, current, def, cause.as_ref());
                    return Ok(Some((format!("{:?}", current), format!("{:?}", flow.current_state()), "error".to_string(), true)));
                }
                let from_dbg = format!("{:?}", current);
                if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                flow.transition_to(t.to);
                if let Some(action) = def.enter_action(t.to) { action(&mut flow.context); }
                return Ok(Some((from_dbg, format!("{:?}", t.to), proc.name().to_string(), false)));
            }
            let from_dbg = format!("{:?}", current);
            if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
            flow.transition_to(t.to);
            if let Some(action) = def.enter_action(t.to) { action(&mut flow.context); }
            return Ok(Some((from_dbg, format!("{:?}", t.to), "auto".to_string(), false)));
        }

        // 3. Branch
        if let Some(t) = def.transitions.iter().find(|t| t.from == current && t.transition_type == TransitionType::Branch) {
            if let Some(branch) = &t.branch {
                let label = branch.decide(&flow.context);
                if let Some(&target) = t.branch_targets.get(&label) {
                    // Find label-specific transition for its processor
                    let specific = def.transitions.iter()
                        .find(|tr| tr.from == current && tr.transition_type == TransitionType::Branch && tr.branch_label.as_deref() == Some(&label))
                        .or_else(|| def.transitions.iter().find(|tr| tr.from == current && tr.transition_type == TransitionType::Branch && tr.to == target))
                        .unwrap_or(t);
                    if let Some(proc) = &specific.processor {
                        proc.process(&mut flow.context)?;
                    }
                    let from_dbg = format!("{:?}", current);
                    if let Some(action) = def.exit_action(current) { action(&mut flow.context); }
                    flow.transition_to(target);
                    if let Some(action) = def.enter_action(target) { action(&mut flow.context); }
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
        Self::handle_error_with_cause(flow, from_state, def, None);
    }

    fn handle_error_with_cause(flow: &mut FlowInstance<S>, from_state: S, def: &FlowDefinition<S>, cause: Option<&FlowError>) {
        if let Some(cause) = cause {
            flow.set_last_error(format!("{}", cause));
        }

        // 1. Try exception-typed routes first (on_step_error)
        if let Some(cause) = cause {
            if let Some(routes) = def.exception_routes.get(&from_state) {
                for route in routes {
                    if (route.predicate)(cause) {
                        flow.transition_to(route.target);
                        if route.target.is_terminal() { flow.complete(format!("{:?}", route.target)); }
                        return;
                    }
                }
            }
        }

        // 2. Fall back to state-based error transition (on_error)
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
