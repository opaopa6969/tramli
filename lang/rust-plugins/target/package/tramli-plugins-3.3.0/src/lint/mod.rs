use tramli::{FlowDefinition, FlowState, TransitionType};
use crate::api::{FindingLocation, PluginReport};

/// Flow policy — a lint rule applied to a flow definition.
pub type FlowPolicy<S> = Box<dyn Fn(&FlowDefinition<S>, &mut PluginReport) + Send + Sync>;

/// Default lint policies.
pub fn default_policies<S: FlowState>() -> Vec<FlowPolicy<S>> {
    vec![
        Box::new(warn_terminal_with_outgoing),
        Box::new(warn_too_many_externals),
        Box::new(warn_dead_produced_data),
        Box::new(warn_overwide_processors),
    ]
}

fn warn_terminal_with_outgoing<S: FlowState>(def: &FlowDefinition<S>, report: &mut PluginReport) {
    for state in def.terminal_states() {
        if !def.transitions_from(*state).is_empty() {
            report.warn_at(
                "policy/terminal-outgoing",
                &format!("terminal state {:?} has outgoing transitions", state),
                FindingLocation::State { state: format!("{:?}", state) },
            );
        }
    }
}

fn warn_too_many_externals<S: FlowState>(def: &FlowDefinition<S>, report: &mut PluginReport) {
    for state in S::all_states() {
        let externals: Vec<_> = def.transitions_from(*state)
            .into_iter()
            .filter(|t| t.transition_type == TransitionType::External)
            .collect();
        if externals.len() > 3 {
            report.warn_at(
                "policy/external-count",
                &format!("state {:?} has {} external transitions", state, externals.len()),
                FindingLocation::State { state: format!("{:?}", state) },
            );
        }
    }
}

fn warn_dead_produced_data<S: FlowState>(def: &FlowDefinition<S>, report: &mut PluginReport) {
    let dead = def.data_flow_graph().dead_data();
    for type_id in dead {
        let name = def.data_flow_graph().type_name(&type_id);
        report.warn_at(
            "policy/dead-data",
            &format!("produced but never consumed: {}", name),
            FindingLocation::Data { data_key: name.to_string() },
        );
    }
}

fn warn_overwide_processors<S: FlowState>(def: &FlowDefinition<S>, report: &mut PluginReport) {
    for t in &def.transitions {
        if let Some(ref p) = t.processor {
            if p.produces().len() > 3 {
                report.warn_at(
                    "policy/overwide-processor",
                    &format!("{} produces {} types; consider splitting it", p.name(), p.produces().len()),
                    FindingLocation::Transition {
                        from_state: format!("{:?}", t.from),
                        to_state: format!("{:?}", t.to),
                    },
                );
            }
        }
    }
}

/// Policy lint plugin — applies lint policies to a flow definition.
pub struct PolicyLintPlugin<S: FlowState> {
    policies: Vec<FlowPolicy<S>>,
}

impl<S: FlowState> PolicyLintPlugin<S> {
    pub fn new(policies: Vec<FlowPolicy<S>>) -> Self {
        Self { policies }
    }

    pub fn defaults() -> Self {
        Self::new(default_policies())
    }

    pub fn analyze(&self, definition: &FlowDefinition<S>, report: &mut PluginReport) {
        for policy in &self.policies {
            policy(definition, report);
        }
    }
}
