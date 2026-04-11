use tramli::{FlowDefinition, FlowState, MermaidGenerator};

/// Diagram bundle — mermaid + data-flow JSON + markdown summary.
#[derive(Debug, Clone)]
pub struct DiagramBundle {
    pub mermaid: String,
    pub data_flow_json: String,
    pub markdown_summary: String,
}

/// Diagram plugin — generates diagram bundles from flow definitions.
pub struct DiagramPlugin;

impl DiagramPlugin {
    pub fn generate<S: FlowState>(definition: &FlowDefinition<S>) -> DiagramBundle {
        let mermaid = MermaidGenerator::generate(definition);
        let json = definition.data_flow_graph().to_json();
        let initial = definition.initial_state()
            .map(|s| format!("{:?}", s))
            .unwrap_or_else(|| "none".to_string());
        let md = format!(
            "# {}\n\n- initial: `{}`\n- states: `{}`\n- transitions: `{}`\n",
            definition.name,
            initial,
            S::all_states().len(),
            definition.transitions.len(),
        );
        DiagramBundle { mermaid, data_flow_json: json, markdown_summary: md }
    }
}
