use std::any::TypeId;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

use crate::data_flow_graph::DataFlowGraph;
use crate::error::FlowError;
use crate::types::*;

pub struct FlowDefinition<S: FlowState> {
    pub name: String,
    pub ttl: Duration,
    pub max_guard_retries: usize,
    pub transitions: Vec<Transition<S>>,
    pub error_transitions: HashMap<S, S>,
    initial_state: Option<S>,
    terminal_states: HashSet<S>,
    data_flow_graph: DataFlowGraph<S>,
}

impl<S: FlowState> FlowDefinition<S> {
    pub fn initial_state(&self) -> Option<S> { self.initial_state }
    pub fn terminal_states(&self) -> &HashSet<S> { &self.terminal_states }
    pub fn data_flow_graph(&self) -> &DataFlowGraph<S> { &self.data_flow_graph }

    pub fn transitions_from(&self, state: S) -> Vec<&Transition<S>> {
        self.transitions.iter().filter(|t| t.from == state).collect()
    }

    pub fn external_from(&self, state: S) -> Option<&Transition<S>> {
        self.transitions.iter().find(|t| t.from == state && t.transition_type == TransitionType::External)
    }
}

// ─── Builder ─────────────────────────────────────────────

pub struct Builder<S: FlowState> {
    name: String,
    ttl: Duration,
    max_guard_retries: usize,
    transitions: Vec<Transition<S>>,
    error_transitions: HashMap<S, S>,
    initially_available: Vec<TypeId>,
    perpetual: bool,
}

impl<S: FlowState> Builder<S> {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(), ttl: Duration::from_secs(300), max_guard_retries: 3,
            transitions: Vec::new(), error_transitions: HashMap::new(),
            initially_available: Vec::new(), perpetual: false,
        }
    }

    pub fn ttl(mut self, ttl: Duration) -> Self { self.ttl = ttl; self }
    pub fn max_guard_retries(mut self, max: usize) -> Self { self.max_guard_retries = max; self }
    pub fn initially_available(mut self, type_ids: Vec<TypeId>) -> Self {
        self.initially_available.extend(type_ids); self
    }
    pub fn allow_perpetual(mut self) -> Self { self.perpetual = true; self }

    pub fn from(self, state: S) -> FromBuilder<S> { FromBuilder { builder: self, from: state } }

    pub fn on_error(mut self, from: S, to: S) -> Self {
        self.error_transitions.insert(from, to); self
    }
    pub fn on_any_error(mut self, error_state: S) -> Self {
        for s in S::all_states() {
            if !s.is_terminal() { self.error_transitions.insert(*s, error_state); }
        }
        self
    }

    pub(crate) fn add_transition(&mut self, t: Transition<S>) { self.transitions.push(t); }

    pub fn build(self) -> Result<FlowDefinition<S>, FlowError> {
        let mut initial = None;
        let mut terminals = HashSet::new();
        for s in S::all_states() {
            if s.is_initial() { initial = Some(*s); }
            if s.is_terminal() { terminals.insert(*s); }
        }
        let perpetual = self.perpetual;
        let initially_available = self.initially_available;
        let name = self.name;
        let def = FlowDefinition {
            name: name.clone(), ttl: self.ttl, max_guard_retries: self.max_guard_retries,
            transitions: self.transitions, error_transitions: self.error_transitions,
            initial_state: initial, terminal_states: terminals,
            data_flow_graph: DataFlowGraph::empty(),
        };
        validate::<S>(&def, &name, perpetual, &initially_available)?;
        let graph = DataFlowGraph::build(&def, &initially_available);
        Ok(FlowDefinition { data_flow_graph: graph, ..def })
    }
}

// ─── FromBuilder ─────────────────────────────────────────

pub struct FromBuilder<S: FlowState> { builder: Builder<S>, from: S }

impl<S: FlowState> FromBuilder<S> {
    pub fn auto(mut self, to: S, processor: impl StateProcessor<S> + 'static) -> Builder<S> {
        self.builder.add_transition(Transition {
            from: self.from, to, transition_type: TransitionType::Auto,
            processor: Some(Box::new(processor)), guard: None, branch: None,
            branch_targets: HashMap::new(),
        });
        self.builder
    }

    pub fn external(mut self, to: S, guard: impl TransitionGuard<S> + 'static) -> Builder<S> {
        self.builder.add_transition(Transition {
            from: self.from, to, transition_type: TransitionType::External,
            processor: None, guard: Some(Box::new(guard)), branch: None,
            branch_targets: HashMap::new(),
        });
        self.builder
    }

    pub fn branch(self, branch: impl BranchProcessor<S> + 'static) -> BranchBuilder<S> {
        BranchBuilder {
            builder: self.builder, from: self.from,
            branch: Some(Box::new(branch)),
            targets: HashMap::new(),
        }
    }
}

// ─── BranchBuilder ───────────────────────────────────────

pub struct BranchBuilder<S: FlowState> {
    builder: Builder<S>, from: S,
    branch: Option<Box<dyn BranchProcessor<S>>>,
    targets: HashMap<String, S>,
}

impl<S: FlowState> BranchBuilder<S> {
    pub fn to(mut self, state: S, label: impl Into<String>) -> Self {
        self.targets.insert(label.into(), state); self
    }

    pub fn end_branch(mut self) -> Builder<S> {
        let targets_clone = self.targets.clone();
        let mut first = true;
        for (_label, target) in &self.targets {
            self.builder.add_transition(Transition {
                from: self.from, to: *target, transition_type: TransitionType::Branch,
                processor: None, guard: None,
                branch: if first { self.branch.take() } else { None },
                branch_targets: targets_clone.clone(),
            });
            first = false;
        }
        self.builder
    }
}

// ─── Validation ─────────────────────────────────────────

fn validate<S: FlowState>(def: &FlowDefinition<S>, name: &str, perpetual: bool, initially_available: &[TypeId]) -> Result<(), FlowError> {
    let mut errors = Vec::new();
    if def.initial_state.is_none() { errors.push("No initial state found".into()); }

    check_reachability(def, &mut errors);
    if !perpetual { check_path_to_terminal(def, &mut errors); }
    check_dag(def, &mut errors);
    check_external_uniqueness(def, &mut errors);
    check_branch_completeness(def, &mut errors);
    check_requires_produces(def, initially_available, &mut errors);
    check_auto_external_conflict(def, &mut errors);
    check_terminal_no_outgoing(def, &mut errors);

    if errors.is_empty() { Ok(()) } else {
        Err(FlowError::new("INVALID_FLOW_DEFINITION",
            format!("Flow '{}' has {} error(s):\n  - {}", name, errors.len(), errors.join("\n  - "))))
    }
}

fn check_reachability<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    let Some(initial) = def.initial_state else { return };
    let mut visited = HashSet::new();
    let mut queue = vec![initial];
    visited.insert(initial);
    while let Some(current) = queue.pop() {
        for t in def.transitions_from(current) { if visited.insert(t.to) { queue.push(t.to); } }
        if let Some(&e) = def.error_transitions.get(&current) { if visited.insert(e) { queue.push(e); } }
    }
    for s in S::all_states() {
        if !visited.contains(s) && !s.is_terminal() {
            errors.push(format!("State {:?} is not reachable from {:?}", s, initial));
        }
    }
}

fn check_path_to_terminal<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    let Some(initial) = def.initial_state else { return };
    let mut visited = HashSet::new();
    if !can_reach_terminal(def, initial, &mut visited) {
        errors.push(format!("No path from {:?} to any terminal state", initial));
    }
}

fn can_reach_terminal<S: FlowState>(def: &FlowDefinition<S>, state: S, visited: &mut HashSet<S>) -> bool {
    if state.is_terminal() { return true; }
    if !visited.insert(state) { return false; }
    for t in def.transitions_from(state) { if can_reach_terminal(def, t.to, visited) { return true; } }
    if let Some(&e) = def.error_transitions.get(&state) { if can_reach_terminal(def, e, visited) { return true; } }
    false
}

fn check_dag<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    let mut graph: HashMap<S, Vec<S>> = HashMap::new();
    for t in &def.transitions {
        if t.transition_type == TransitionType::Auto || t.transition_type == TransitionType::Branch {
            graph.entry(t.from).or_default().push(t.to);
        }
    }
    let mut visited = HashSet::new();
    let mut in_stack = HashSet::new();
    for s in S::all_states() {
        if !visited.contains(s) && has_cycle(&graph, *s, &mut visited, &mut in_stack) {
            errors.push(format!("Auto/Branch transitions contain a cycle involving {:?}", s));
            break;
        }
    }
}

fn has_cycle<S: FlowState>(graph: &HashMap<S, Vec<S>>, node: S, visited: &mut HashSet<S>, in_stack: &mut HashSet<S>) -> bool {
    visited.insert(node); in_stack.insert(node);
    if let Some(ns) = graph.get(&node) {
        for &n in ns {
            if in_stack.contains(&n) { return true; }
            if !visited.contains(&n) && has_cycle(graph, n, visited, in_stack) { return true; }
        }
    }
    in_stack.remove(&node); false
}

fn check_external_uniqueness<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    let mut counts: HashMap<S, usize> = HashMap::new();
    for t in &def.transitions { if t.transition_type == TransitionType::External { *counts.entry(t.from).or_default() += 1; } }
    for (s, c) in counts { if c > 1 { errors.push(format!("State {:?} has {} external transitions (max 1)", s, c)); } }
}

fn check_branch_completeness<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    let all: HashSet<S> = S::all_states().iter().copied().collect();
    for t in &def.transitions {
        if t.transition_type == TransitionType::Branch {
            for (label, target) in &t.branch_targets {
                if !all.contains(target) { errors.push(format!("Branch target '{}' -> {:?} is not a valid state", label, target)); }
            }
        }
    }
}

fn check_requires_produces<S: FlowState>(def: &FlowDefinition<S>, initially_available: &[TypeId], errors: &mut Vec<String>) {
    let Some(initial) = def.initial_state else { return };
    let mut state_available: HashMap<S, HashSet<TypeId>> = HashMap::new();
    let init_set: HashSet<TypeId> = initially_available.iter().copied().collect();
    check_rp_from(def, initial, &init_set, &mut state_available, errors);
}

fn check_rp_from<S: FlowState>(def: &FlowDefinition<S>, state: S, available: &HashSet<TypeId>,
    state_available: &mut HashMap<S, HashSet<TypeId>>, errors: &mut Vec<String>) {
    if let Some(existing) = state_available.get_mut(&state) {
        if available.is_subset(existing) { return; }
        let new_set: HashSet<TypeId> = existing.intersection(available).copied().collect();
        if new_set == *existing { return; } // no change after intersection — stop
        *existing = new_set;
    } else {
        state_available.insert(state, available.clone());
    }
    for t in def.transitions_from(state) {
        let mut new_avail = state_available.get(&state).unwrap().clone();
        if let Some(g) = &t.guard {
            for r in g.requires() { if !new_avail.contains(&r) { errors.push(format!("Guard '{}' at {:?} requires a type that may not be available", g.name(), t.from)); } }
            new_avail.extend(g.produces());
        }
        if let Some(b) = &t.branch {
            for r in b.requires() { if !new_avail.contains(&r) { errors.push(format!("Branch '{}' at {:?} requires a type that may not be available", b.name(), t.from)); } }
        }
        if let Some(p) = &t.processor {
            for r in p.requires() { if !new_avail.contains(&r) { errors.push(format!("Processor '{}' at {:?}->{:?} requires a type that may not be available", p.name(), t.from, t.to)); } }
            new_avail.extend(p.produces());
        }
        check_rp_from(def, t.to, &new_avail, state_available, errors);
    }
}

fn check_auto_external_conflict<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    for s in S::all_states() {
        let trans = def.transitions_from(*s);
        let has_auto = trans.iter().any(|t| t.transition_type == TransitionType::Auto || t.transition_type == TransitionType::Branch);
        let has_ext = trans.iter().any(|t| t.transition_type == TransitionType::External);
        if has_auto && has_ext { errors.push(format!("State {:?} has both auto/branch and external transitions", s)); }
    }
}

fn check_terminal_no_outgoing<S: FlowState>(def: &FlowDefinition<S>, errors: &mut Vec<String>) {
    for t in &def.transitions {
        if t.from.is_terminal() { errors.push(format!("Terminal state {:?} has outgoing transition to {:?}", t.from, t.to)); }
    }
}
