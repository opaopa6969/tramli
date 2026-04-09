use tramli::{FlowDefinition, FlowState, TransitionType};

/// Scenario kind classification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioKind {
    Happy,
    Error,
    GuardRejection,
    Timeout,
}

/// A test scenario step.
#[derive(Debug, Clone)]
pub struct FlowScenario {
    pub name: String,
    pub kind: ScenarioKind,
    pub steps: Vec<String>,
}

/// A test plan containing generated scenarios.
#[derive(Debug, Clone)]
pub struct FlowTestPlan {
    pub scenarios: Vec<FlowScenario>,
}

/// Scenario test plugin — generates BDD-style scenarios from a flow definition.
/// Covers happy paths, error transitions, guard rejections, and timeout expiry.
pub struct ScenarioTestPlugin;

impl ScenarioTestPlugin {
    pub fn generate<S: FlowState>(definition: &FlowDefinition<S>) -> FlowTestPlan {
        let mut scenarios = Vec::new();

        // Happy path scenarios from transitions
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
                kind: ScenarioKind::Happy,
                steps,
            });
        }

        // Error path scenarios from error_transitions
        for (from, to) in &definition.error_transitions {
            scenarios.push(FlowScenario {
                name: format!("error_{:?}_to_{:?}", from, to),
                kind: ScenarioKind::Error,
                steps: vec![
                    format!("given flow in {:?}", from),
                    "when processor throws an error".to_string(),
                    format!("then flow transitions to {:?} via on_error", to),
                ],
            });
        }

        // Exception route scenarios
        for (from, routes) in &definition.exception_routes {
            for route in routes {
                let label = &route.label;
                let target = &route.target;
                scenarios.push(FlowScenario {
                    name: format!("step_error_{:?}_{}_to_{:?}", from, label, target),
                    kind: ScenarioKind::Error,
                    steps: vec![
                        format!("given flow in {:?}", from),
                        format!("when error matching {} is thrown", label),
                        format!("then flow transitions to {:?} via on_step_error", target),
                    ],
                });
            }
        }

        // Guard rejection scenarios
        for t in &definition.transitions {
            if matches!(t.transition_type, TransitionType::External) {
                if let Some(ref g) = t.guard {
                    let error_target = definition.error_transitions.get(&t.from);
                    scenarios.push(FlowScenario {
                        name: format!("guard_reject_{:?}_{}", t.from, g.name()),
                        kind: ScenarioKind::GuardRejection,
                        steps: vec![
                            format!("given flow in {:?}", t.from),
                            format!("when guard {} rejects {} times", g.name(), definition.max_guard_retries),
                            if let Some(target) = error_target {
                                format!("then flow transitions to {:?} via error", target)
                            } else {
                                "then flow enters TERMINAL_ERROR".to_string()
                            },
                        ],
                    });
                }
            }
        }

        // Timeout scenarios
        for t in &definition.transitions {
            if let Some(timeout) = t.timeout {
                scenarios.push(FlowScenario {
                    name: format!("timeout_{:?}", t.from),
                    kind: ScenarioKind::Timeout,
                    steps: vec![
                        format!("given flow in {:?}", t.from),
                        format!("when per-state timeout of {}ms expires", timeout.as_millis()),
                        "then flow completes as EXPIRED".to_string(),
                    ],
                });
            }
        }

        FlowTestPlan { scenarios }
    }
}
