use tramli::{FlowDefinition, FlowState, TransitionType};

/// A test scenario step.
#[derive(Debug, Clone)]
pub struct FlowScenario {
    pub name: String,
    pub steps: Vec<String>,
}

/// A test plan containing generated scenarios.
#[derive(Debug, Clone)]
pub struct FlowTestPlan {
    pub scenarios: Vec<FlowScenario>,
}

/// Scenario test plugin — generates BDD-style scenarios from a flow definition.
pub struct ScenarioTestPlugin;

impl ScenarioTestPlugin {
    pub fn generate<S: FlowState>(definition: &FlowDefinition<S>) -> FlowTestPlan {
        let mut scenarios = Vec::new();
        for t in &definition.transitions {
            let mut steps = Vec::new();
            steps.push(format!("given flow in {:?}", t.from));
            match t.transition_type {
                TransitionType::External => {
                    if let Some(ref g) = t.guard {
                        steps.push(format!("when external data satisfies guard {}", g.name()));
                    }
                }
                TransitionType::Auto => {
                    if let Some(ref p) = t.processor {
                        steps.push(format!("when auto processor {} runs", p.name()));
                    }
                }
                TransitionType::Branch => {
                    if let Some(ref b) = t.branch {
                        steps.push(format!("when branch {} selects a route", b.name()));
                    }
                }
                _ => {}
            }
            steps.push(format!("then flow reaches {:?}", t.to));
            scenarios.push(FlowScenario {
                name: format!("{:?}_to_{:?}", t.from, t.to),
                steps,
            });
        }
        FlowTestPlan { scenarios }
    }
}
