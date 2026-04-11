use std::any::TypeId;
use std::collections::HashSet;
use tramli::{FlowDefinition, FlowState};

/// Validates subflow entry requirements against parent's available data.
pub struct GuaranteedSubflowValidator;

impl GuaranteedSubflowValidator {
    pub fn validate<S: FlowState, T: FlowState>(
        parent: &FlowDefinition<S>,
        parent_state: S,
        subflow: &FlowDefinition<T>,
        guaranteed_types: &HashSet<TypeId>,
    ) -> Result<(), String> {
        let mut available: HashSet<TypeId> = parent.data_flow_graph().available_at(parent_state);
        available.extend(guaranteed_types);

        if let Some(initial) = subflow.initial_state() {
            let required_at_entry = subflow.data_flow_graph().available_at(initial);
            let missing: HashSet<TypeId> = required_at_entry.difference(&available).cloned().collect();
            if !missing.is_empty() {
                let missing_names: Vec<String> = missing.iter()
                    .map(|id| subflow.data_flow_graph().type_name(id).to_string())
                    .collect();
                return Err(format!(
                    "Subflow {} is missing guaranteed types at entry: [{}]",
                    subflow.name,
                    missing_names.join(", "),
                ));
            }
        }
        Ok(())
    }
}
