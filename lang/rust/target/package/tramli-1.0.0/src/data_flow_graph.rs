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

    /// All type nodes in the graph.
    pub fn all_types(&self) -> HashSet<TypeId> {
        self.all_produced.union(&self.all_consumed).copied().collect()
    }

    /// Get the human-readable name for a TypeId (if registered).
    pub fn type_name(&self, type_id: &TypeId) -> &str {
        self.type_names.get(type_id).map(|s| s.as_str()).unwrap_or("unknown")
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
