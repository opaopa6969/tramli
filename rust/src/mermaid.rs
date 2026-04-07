use std::collections::HashSet;

use crate::definition::FlowDefinition;
use crate::types::*;

/// Generates Mermaid diagrams from FlowDefinition.
pub struct MermaidGenerator;

impl MermaidGenerator {
    /// Generate Mermaid stateDiagram-v2 (state transitions).
    pub fn generate<S: FlowState>(def: &FlowDefinition<S>) -> String {
        let mut lines = vec!["stateDiagram-v2".to_string()];

        if let Some(initial) = def.initial_state() {
            lines.push(format!("    [*] --> {:?}", initial));
        }

        let mut seen = HashSet::new();
        for t in &def.transitions {
            let key = format!("{:?}->{:?}", t.from, t.to);
            if !seen.insert(key) { continue; }
            let label = Self::transition_label(t);
            if label.is_empty() {
                lines.push(format!("    {:?} --> {:?}", t.from, t.to));
            } else {
                lines.push(format!("    {:?} --> {:?} : {}", t.from, t.to, label));
            }
        }

        for (from, to) in &def.error_transitions {
            let key = format!("{:?}->{:?}", from, to);
            if !seen.insert(key) { continue; }
            lines.push(format!("    {:?} --> {:?} : error", from, to));
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
        }
    }
}
