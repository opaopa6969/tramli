use std::any::TypeId;
use std::collections::{HashMap, HashSet};

use crate::definition::FlowDefinition;
use crate::types::*;

/// Info about a processor/guard that produces or consumes a type.
#[derive(Debug, Clone)]
pub struct NodeInfo<S: FlowState> {
    pub name: String,
    pub from_state: S,
    pub to_state: S,
    pub kind: &'static str, // "processor", "guard", "branch", "initial"
}

/// Bipartite graph of data types (TypeId) and processors/guards.
/// Built automatically during FlowDefinition::build().
pub struct DataFlowGraph<S: FlowState> {
    available_at_state: HashMap<S, HashSet<TypeId>>,
    producers: HashMap<TypeId, Vec<NodeInfo<S>>>,
    consumers: HashMap<TypeId, Vec<NodeInfo<S>>>,
    all_produced: HashSet<TypeId>,
    all_consumed: HashSet<TypeId>,
    /// TypeId → human-readable name (from std::any::type_name at registration)
    type_names: HashMap<TypeId, String>,
}

impl<S: FlowState> DataFlowGraph<S> {
    pub(crate) fn empty() -> Self {
        Self {
            available_at_state: HashMap::new(), producers: HashMap::new(),
            consumers: HashMap::new(), all_produced: HashSet::new(),
            all_consumed: HashSet::new(), type_names: HashMap::new(),
        }
    }

    /// Data types available in context when the flow reaches the given state.
    pub fn available_at(&self, state: S) -> HashSet<TypeId> {
        self.available_at_state.get(&state).cloned().unwrap_or_default()
    }

    /// Processors/guards that produce the given type.
    pub fn producers_of(&self, type_id: &TypeId) -> &[NodeInfo<S>] {
        self.producers.get(type_id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Processors/guards that consume (require) the given type.
    pub fn consumers_of(&self, type_id: &TypeId) -> &[NodeInfo<S>] {
        self.consumers.get(type_id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Types produced but never required by any downstream processor/guard.
    pub fn dead_data(&self) -> HashSet<TypeId> {
        self.all_produced.difference(&self.all_consumed).copied().collect()
    }

    /// Data lifetime: which states a type is first produced and last consumed.
    pub fn lifetime(&self, type_id: &TypeId) -> Option<(S, S)> {
        let prods = self.producers.get(type_id)?;
        if prods.is_empty() { return None; }
        let first = prods[0].to_state;
        let last = self.consumers.get(type_id)
            .and_then(|c| c.last())
            .map(|c| c.from_state)
            .unwrap_or(first);
        Some((first, last))
    }

    /// Context pruning hints: for each state, types available but not required at that state.
    pub fn pruning_hints(&self) -> HashMap<S, HashSet<TypeId>> {
        let mut consumed_at: HashMap<S, HashSet<TypeId>> = HashMap::new();
        for (type_id, nodes) in &self.consumers {
            for node in nodes {
                consumed_at.entry(node.from_state).or_default().insert(*type_id);
            }
        }
        let mut hints = HashMap::new();
        for (state, available) in &self.available_at_state {
            let needed = consumed_at.get(state);
            let prunable: HashSet<TypeId> = available.iter()
                .filter(|t| needed.map_or(true, |n| !n.contains(t)))
                .copied().collect();
            if !prunable.is_empty() { hints.insert(*state, prunable); }
        }
        hints
    }

    /// Check if processor B can replace processor A without breaking data-flow.
    /// B requires no more than A, and B produces at least what A produces.
    pub fn is_compatible(
        a_requires: &[TypeId], a_produces: &[TypeId],
        b_requires: &[TypeId], b_produces: &[TypeId],
    ) -> bool {
        let a_reqs: HashSet<_> = a_requires.iter().collect();
        let b_reqs: HashSet<_> = b_requires.iter().collect();
        let a_prods: HashSet<_> = a_produces.iter().collect();
        let b_prods: HashSet<_> = b_produces.iter().collect();
        b_reqs.is_subset(&a_reqs) && a_prods.is_subset(&b_prods)
    }

    /// Verify a processor's requires are in context, and after execution produces are present.
    /// Returns list of violation strings (empty = OK).
    pub fn verify_processor(
        processor: &dyn crate::types::StateProcessor<S>,
        ctx: &mut crate::context::FlowContext,
    ) -> Vec<String> {
        let mut violations = Vec::new();
        for req in processor.requires() {
            if !ctx.has_type_id(&req) {
                violations.push(format!("requires a type that is not in context"));
            }
        }
        let before: HashSet<TypeId> = HashSet::new(); // can't enumerate ctx keys easily
        match processor.process(ctx) {
            Ok(()) => {}
            Err(e) => {
                violations.push(format!("threw: {}", e));
                return violations;
            }
        }
        // Check produces after execution
        for prod in processor.produces() {
            if !ctx.has_type_id(&prod) {
                violations.push(format!("declares produces but did not put it"));
            }
        }
        violations
    }

    /// All type nodes in the graph.
    pub fn all_types(&self) -> HashSet<TypeId> {
        self.all_produced.union(&self.all_consumed).copied().collect()
    }

    /// Get the human-readable name for a TypeId (if registered).
    pub fn type_name(&self, type_id: &TypeId) -> &str {
        self.type_names.get(type_id).map(|s| s.as_str()).unwrap_or("unknown")
    }

    /// Assert that a flow's context satisfies the data-flow invariant at the given state.
    /// Returns list of missing TypeIds (empty = OK).
    pub fn assert_data_flow(&self, ctx: &crate::context::FlowContext, current_state: S) -> Vec<TypeId> {
        let mut missing = Vec::new();
        for &type_id in self.available_at(current_state).iter() {
            if !ctx.has_type_id(&type_id) { missing.push(type_id); }
        }
        missing
    }

    /// Impact analysis: all producers and consumers of a given type.
    pub fn impact_of(&self, type_id: &TypeId) -> (Vec<&NodeInfo<S>>, Vec<&NodeInfo<S>>) {
        let prods: Vec<_> = self.producers_of(type_id).iter().collect();
        let cons: Vec<_> = self.consumers_of(type_id).iter().collect();
        (prods, cons)
    }

    /// Parallelism hints: pairs of processor names with no data dependency.
    pub fn parallelism_hints(&self) -> Vec<(String, String)> {
        let mut all_nodes: Vec<String> = Vec::new();
        for nodes in self.producers.values() { for n in nodes { if !all_nodes.contains(&n.name) { all_nodes.push(n.name.clone()); } } }
        for nodes in self.consumers.values() { for n in nodes { if !all_nodes.contains(&n.name) { all_nodes.push(n.name.clone()); } } }
        let mut hints = Vec::new();
        for i in 0..all_nodes.len() {
            for j in (i+1)..all_nodes.len() {
                let (a, b) = (&all_nodes[i], &all_nodes[j]);
                let a_prods: HashSet<_> = self.producers.iter().filter(|(_, ns)| ns.iter().any(|n| &n.name == a)).map(|(t, _)| t).collect();
                let b_reqs: HashSet<_> = self.consumers.iter().filter(|(_, ns)| ns.iter().any(|n| &n.name == b)).map(|(t, _)| t).collect();
                let b_prods: HashSet<_> = self.producers.iter().filter(|(_, ns)| ns.iter().any(|n| &n.name == b)).map(|(t, _)| t).collect();
                let a_reqs: HashSet<_> = self.consumers.iter().filter(|(_, ns)| ns.iter().any(|n| &n.name == a)).map(|(t, _)| t).collect();
                let a_dep_b = a_reqs.iter().any(|r| b_prods.contains(r));
                let b_dep_a = b_reqs.iter().any(|r| a_prods.contains(r));
                if !a_dep_b && !b_dep_a { hints.push((a.clone(), b.clone())); }
            }
        }
        hints
    }

    /// Structured JSON representation.
    pub fn to_json(&self) -> String {
        let mut types = Vec::new();
        for type_id in self.all_types() {
            let name = self.short_type_name(&type_id);
            let prods: Vec<String> = self.producers_of(&type_id).iter().map(|n| n.name.clone()).collect();
            let cons: Vec<String> = self.consumers_of(&type_id).iter().map(|n| n.name.clone()).collect();
            let mut entry = format!("{{\"name\": \"{}\"", name);
            if !prods.is_empty() { entry += &format!(", \"producers\": [{}]", prods.iter().map(|p| format!("\"{}\"", p)).collect::<Vec<_>>().join(", ")); }
            if !cons.is_empty() { entry += &format!(", \"consumers\": [{}]", cons.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")); }
            entry += "}";
            types.push(entry);
        }
        let dead: Vec<String> = self.dead_data().iter().map(|t| format!("\"{}\"", self.short_type_name(t))).collect();
        format!("{{\n  \"types\": [\n    {}\n  ],\n  \"deadData\": [{}]\n}}", types.join(",\n    "), dead.join(", "))
    }

    /// Generate Mermaid data-flow diagram.
    pub fn to_mermaid(&self) -> String {
        let mut lines = vec!["flowchart LR".to_string()];
        let mut seen = HashSet::new();

        for (type_id, nodes) in &self.producers {
            let type_name = self.short_type_name(type_id);
            for node in nodes {
                let edge = format!("{} -->|produces| {}", node.name, type_name);
                if seen.insert(edge.clone()) {
                    lines.push(format!("    {}", edge));
                }
            }
        }
        for (type_id, nodes) in &self.consumers {
            let type_name = self.short_type_name(type_id);
            for node in nodes {
                let edge = format!("{} -->|requires| {}", type_name, node.name);
                if seen.insert(edge.clone()) {
                    lines.push(format!("    {}", edge));
                }
            }
        }

        lines.push(String::new());
        lines.join("\n")
    }

    fn short_type_name(&self, type_id: &TypeId) -> String {
        let full = self.type_name(type_id);
        // Extract last segment after ::
        full.rsplit("::").next().unwrap_or(full).to_string()
    }

    /// Test scaffold: for each processor, list required type names.
    pub fn test_scaffold(&self) -> HashMap<String, Vec<String>> {
        let mut scaffold: HashMap<String, Vec<String>> = HashMap::new();
        for (type_id, nodes) in &self.consumers {
            for node in nodes {
                scaffold.entry(node.name.clone()).or_default()
                    .push(self.short_type_name(type_id));
            }
        }
        scaffold
    }

    /// Generate data-flow invariant assertions as strings.
    pub fn generate_invariant_assertions(&self) -> Vec<String> {
        let mut assertions = Vec::new();
        for (state, types) in &self.available_at_state {
            let mut names: Vec<String> = types.iter().map(|t| self.short_type_name(t)).collect();
            names.sort();
            assertions.push(format!("At state {:?}: context must contain {:?}", state, names));
        }
        assertions
    }

    /// Diff two data-flow graphs. Returns added/removed type names.
    pub fn diff(before: &DataFlowGraph<S>, after: &DataFlowGraph<S>) -> (Vec<String>, Vec<String>) {
        let before_types: HashSet<_> = before.all_types().iter().map(|t| before.short_type_name(t)).collect();
        let after_types: HashSet<_> = after.all_types().iter().map(|t| after.short_type_name(t)).collect();
        let added: Vec<String> = after_types.difference(&before_types).cloned().collect();
        let removed: Vec<String> = before_types.difference(&after_types).cloned().collect();
        (added, removed)
    }

    // ─── Builder ─────────────────────────────────────────────

    pub(crate) fn build(def: &FlowDefinition<S>, initially_available: &[TypeId]) -> Self {
        let mut state_avail: HashMap<S, HashSet<TypeId>> = HashMap::new();
        let mut producers: HashMap<TypeId, Vec<NodeInfo<S>>> = HashMap::new();
        let mut consumers: HashMap<TypeId, Vec<NodeInfo<S>>> = HashMap::new();
        let mut all_produced: HashSet<TypeId> = initially_available.iter().copied().collect();
        let mut all_consumed: HashSet<TypeId> = HashSet::new();
        let mut type_names: HashMap<TypeId, String> = HashMap::new();

        if let Some(initial) = def.initial_state() {
            Self::traverse(def, initial, &initially_available.iter().copied().collect(),
                &mut state_avail, &mut producers, &mut consumers,
                &mut all_produced, &mut all_consumed, &mut type_names);

            // Mark initially available types as produced by "initial"
            for &tid in initially_available {
                producers.entry(tid).or_default().push(NodeInfo {
                    name: "initial".to_string(),
                    from_state: initial, to_state: initial,
                    kind: "initial",
                });
            }
        }

        Self { available_at_state: state_avail, producers, consumers, all_produced, all_consumed, type_names }
    }

    fn traverse(
        def: &FlowDefinition<S>, state: S, available: &HashSet<TypeId>,
        state_avail: &mut HashMap<S, HashSet<TypeId>>,
        producers: &mut HashMap<TypeId, Vec<NodeInfo<S>>>,
        consumers: &mut HashMap<TypeId, Vec<NodeInfo<S>>>,
        all_produced: &mut HashSet<TypeId>, all_consumed: &mut HashSet<TypeId>,
        type_names: &mut HashMap<TypeId, String>,
    ) {
        if let Some(existing) = state_avail.get_mut(&state) {
            if available.is_subset(existing) { return; }
            let new_set: HashSet<TypeId> = existing.intersection(available).copied().collect();
            if new_set == *existing { return; }
            *existing = new_set;
        } else {
            state_avail.insert(state, available.clone());
        }

        for t in def.transitions.iter().filter(|t| t.from == state) {
            let mut new_avail = state_avail.get(&state).unwrap().clone();

            if let Some(guard) = &t.guard {
                for req in guard.requires() {
                    consumers.entry(req).or_default().push(NodeInfo {
                        name: guard.name().to_string(), from_state: t.from, to_state: t.to, kind: "guard",
                    });
                    all_consumed.insert(req);
                }
                for prod in guard.produces() {
                    producers.entry(prod).or_default().push(NodeInfo {
                        name: guard.name().to_string(), from_state: t.from, to_state: t.to, kind: "guard",
                    });
                    all_produced.insert(prod);
                    new_avail.insert(prod);
                }
            }
            if let Some(branch) = &t.branch {
                for req in branch.requires() {
                    consumers.entry(req).or_default().push(NodeInfo {
                        name: branch.name().to_string(), from_state: t.from, to_state: t.to, kind: "branch",
                    });
                    all_consumed.insert(req);
                }
            }
            if let Some(proc) = &t.processor {
                for req in proc.requires() {
                    consumers.entry(req).or_default().push(NodeInfo {
                        name: proc.name().to_string(), from_state: t.from, to_state: t.to, kind: "processor",
                    });
                    all_consumed.insert(req);
                }
                for prod in proc.produces() {
                    producers.entry(prod).or_default().push(NodeInfo {
                        name: proc.name().to_string(), from_state: t.from, to_state: t.to, kind: "processor",
                    });
                    all_produced.insert(prod);
                    new_avail.insert(prod);
                }
            }

            // Collect type names from requires/produces
            if let Some(proc) = &t.processor {
                Self::collect_type_names(proc.requires(), proc.produces(), type_names);
            }
            if let Some(guard) = &t.guard {
                Self::collect_type_names(guard.requires(), guard.produces(), type_names);
            }

            Self::traverse(def, t.to, &new_avail, state_avail, producers, consumers,
                all_produced, all_consumed, type_names);
        }
    }

    fn collect_type_names(_requires: Vec<TypeId>, _produces: Vec<TypeId>, _type_names: &mut HashMap<TypeId, String>) {
        // TypeId doesn't carry names at runtime in Rust.
        // Names are registered separately via register_type_name().
    }

    /// Register a human-readable name for a TypeId (for Mermaid output).
    pub fn register_type_name<T: 'static>(&mut self) {
        let name = std::any::type_name::<T>().to_string();
        self.type_names.insert(TypeId::of::<T>(), name);
    }
}
