use std::collections::HashSet;

use crate::definition::FlowDefinition;
use crate::types::*;

/// Which diagram to generate.
///
/// - `State`: state transitions (stateDiagram-v2)
/// - `DataFlow`: data-flow graph (nodes = processors/guards, edges = FlowKey types)
///
/// Corresponds to Issue #47. See also DD-042 Implication.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MermaidView {
    State,
    DataFlow,
}

/// Generates Mermaid diagrams from FlowDefinition.
pub struct MermaidGenerator;

impl MermaidGenerator {
    /// Generate Mermaid stateDiagram-v2 (state transitions).
    pub fn generate<S: FlowState>(def: &FlowDefinition<S>) -> String {
        Self::generate_with_options(def, false)
    }

    /// Generate Mermaid diagram with view selection.
    /// Equivalent to [`Self::generate_data_flow`] when view is `DataFlow`.
    pub fn generate_with_view<S: FlowState>(def: &FlowDefinition<S>, view: MermaidView) -> String {
        match view {
            MermaidView::DataFlow => Self::generate_data_flow(def),
            MermaidView::State => Self::generate(def),
        }
    }

    /// Generate Mermaid stateDiagram-v2 with options.
    pub fn generate_with_options<S: FlowState>(def: &FlowDefinition<S>, exclude_error_transitions: bool) -> String {
        let mut lines = vec!["stateDiagram-v2".to_string()];

        if let Some(initial) = def.initial_state() {
            lines.push(format!("    [*] --> {:?}", initial));
        }

        let mut seen = HashSet::new();
        for t in &def.transitions {
            if t.transition_type == TransitionType::SubFlow {
                if let Some(ref config) = t.sub_flow {
                    lines.push(format!("    state {:?} {{", t.from));
                    // Delegate to runner for terminal names (type-erased)
                    for term in config.runner.terminal_names() {
                        lines.push(format!("        {} --> [*]", term));
                    }
                    lines.push("    }".to_string());
                    for (exit_name, target) in &config.exit_mappings {
                        lines.push(format!("    {:?} --> {:?} : {}", t.from, target, exit_name));
                    }
                }
                continue;
            }
            let key = format!("{:?}->{:?}", t.from, t.to);
            if !seen.insert(key) { continue; }
            let label = Self::transition_label(t);
            if label.is_empty() {
                lines.push(format!("    {:?} --> {:?}", t.from, t.to));
            } else {
                lines.push(format!("    {:?} --> {:?} : {}", t.from, t.to, label));
            }
        }

        if !exclude_error_transitions {
            for (from, to) in &def.error_transitions {
                let key = format!("{:?}->{:?}", from, to);
                if !seen.insert(key) { continue; }
                lines.push(format!("    {:?} --> {:?} : error", from, to));
            }
        }

        for s in S::all_states() {
            if s.is_terminal() {
                lines.push(format!("    {:?} --> [*]", s));
            }
        }

        lines.push(String::new());
        lines.join("\n")
    }

    /// Generate Mermaid data-flow diagram from requires/produces.
    pub fn generate_data_flow<S: FlowState>(def: &FlowDefinition<S>) -> String {
        def.data_flow_graph().to_mermaid()
    }

    fn transition_label<S: FlowState>(t: &Transition<S>) -> String {
        match t.transition_type {
            TransitionType::Auto => t.processor.as_ref().map(|p| p.name().to_string()).unwrap_or_default(),
            TransitionType::External => t.guard.as_ref().map(|g| format!("[{}]", g.name())).unwrap_or_default(),
            TransitionType::Branch => t.branch.as_ref().map(|b| b.name().to_string()).unwrap_or_default(),
            TransitionType::SubFlow => t.sub_flow.as_ref().map(|s| format!("{{{}}}", s.runner.name())).unwrap_or_default(),
        }
    }
}
