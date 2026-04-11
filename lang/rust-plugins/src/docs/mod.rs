use tramli::{FlowDefinition, FlowState};

/// Documentation plugin — generates markdown flow catalogs.
pub struct DocumentationPlugin;

impl DocumentationPlugin {
    pub fn to_markdown<S: FlowState>(definition: &FlowDefinition<S>) -> String {
        let mut lines = Vec::new();
        lines.push(format!("# Flow Catalog: {}", definition.name));
        lines.push(String::new());
        lines.push("## States".to_string());
        lines.push(String::new());
        for state in S::all_states() {
            let mut suffix = String::new();
            if state.is_initial() { suffix.push_str(" (initial)"); }
            if state.is_terminal() { suffix.push_str(" (terminal)"); }
            lines.push(format!("- `{:?}`{}", state, suffix));
        }
        lines.push(String::new());
        lines.push("## Transitions".to_string());
        lines.push(String::new());
        for t in &definition.transitions {
            let via = if let Some(ref p) = t.processor {
                p.name().to_string()
            } else if let Some(ref g) = t.guard {
                g.name().to_string()
            } else if let Some(ref b) = t.branch {
                b.name().to_string()
            } else {
                format!("{:?}", t.transition_type)
            };
            lines.push(format!("- `{:?} -> {:?}` via `{}`", t.from, t.to, via));
        }
        lines.join("\n")
    }
}
