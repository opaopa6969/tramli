use std::any::TypeId;
use std::collections::{HashMap, HashSet, LinkedList};
use crate::context::FlowContext;
use crate::error::FlowError;

/// A step in a Pipeline. Like StateProcessor but without FlowState generic.
pub trait PipelineStep: Send + Sync {
    fn name(&self) -> &str;
    fn requires(&self) -> Vec<TypeId>;
    fn produces(&self) -> Vec<TypeId>;
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError>;
}

/// Error from a failed pipeline step.
pub struct PipelineError {
    pub failed_step: String,
    pub completed_steps: Vec<String>,
    pub cause: FlowError,
}

/// Lightweight data-flow analysis for Pipelines.
pub struct PipelineDataFlow {
    steps: Vec<(String, Vec<TypeId>, Vec<TypeId>)>, // (name, requires, produces)
    initially_available: HashSet<TypeId>,
}

impl PipelineDataFlow {
    pub fn dead_data(&self) -> HashSet<TypeId> {
        let mut all_produced: HashSet<TypeId> = self.initially_available.clone();
        let mut all_consumed = HashSet::new();
        for (_, reqs, prods) in &self.steps {
            for r in reqs { all_consumed.insert(*r); }
            for p in prods { all_produced.insert(*p); }
        }
        all_produced.difference(&all_consumed).copied().collect()
    }

    pub fn step_order(&self) -> Vec<String> {
        self.steps.iter().map(|(n, _, _)| n.clone()).collect()
    }

    pub fn to_mermaid(&self) -> String {
        let mut lines = vec!["flowchart LR".to_string()];
        for (name, reqs, prods) in &self.steps {
            for r in reqs { lines.push(format!("    {:?} -->|requires| {}", r, name)); }
            for p in prods { lines.push(format!("    {} -->|produces| {:?}", name, p)); }
        }
        lines.push(String::new());
        lines.join("\n")
    }
}

/// Build-time verified pipeline.
pub struct Pipeline {
    name: String,
    steps: Vec<Box<dyn PipelineStep>>,
    initially_available: HashSet<TypeId>,
    strict_mode: bool,
}

impl Pipeline {
    pub fn name(&self) -> &str { &self.name }

    pub fn data_flow(&self) -> PipelineDataFlow {
        let steps = self.steps.iter()
            .map(|s| (s.name().to_string(), s.requires(), s.produces()))
            .collect();
        PipelineDataFlow { steps, initially_available: self.initially_available.clone() }
    }

    pub fn set_strict_mode(&mut self, strict: bool) { self.strict_mode = strict; }

    pub fn execute(&self, initial_data: Vec<(TypeId, Box<dyn crate::CloneAny>)>) -> Result<FlowContext, PipelineError> {
        let mut ctx = FlowContext::new(format!("pipeline-{}", self.name));
        for (tid, val) in initial_data { ctx.put_raw(tid, val); }

        let mut completed = Vec::new();

        for step in &self.steps {
            match step.process(&mut ctx) {
                Ok(()) => {}
                Err(e) => {
                    return Err(PipelineError {
                        failed_step: step.name().to_string(),
                        completed_steps: completed,
                        cause: e,
                    });
                }
            }

            if self.strict_mode {
                for prod in step.produces() {
                    if !ctx.has_type_id(&prod) {
                        return Err(PipelineError {
                            failed_step: step.name().to_string(),
                            completed_steps: completed,
                            cause: FlowError::new("PRODUCES_VIOLATION",
                                format!("Step '{}' declares produces but did not put it", step.name())),
                        });
                    }
                }
            }

            completed.push(step.name().to_string());
        }

        Ok(ctx)
    }
}

/// Pipeline builder.
pub struct PipelineBuilder {
    name: String,
    steps: Vec<Box<dyn PipelineStep>>,
    initially_available: Vec<TypeId>,
}

impl PipelineBuilder {
    pub fn new(name: &str) -> Self {
        Self { name: name.to_string(), steps: Vec::new(), initially_available: Vec::new() }
    }

    pub fn initially_available(mut self, types: Vec<TypeId>) -> Self {
        self.initially_available.extend(types);
        self
    }

    pub fn step(mut self, s: Box<dyn PipelineStep>) -> Self {
        self.steps.push(s);
        self
    }

    pub fn build(self) -> Result<Pipeline, FlowError> {
        let mut errors = Vec::new();
        let mut available: HashSet<TypeId> = self.initially_available.iter().copied().collect();
        for step in &self.steps {
            for req in step.requires() {
                if !available.contains(&req) {
                    errors.push(format!("Step '{}' requires a type that may not be available", step.name()));
                }
            }
            for prod in step.produces() { available.insert(prod); }
        }
        if !errors.is_empty() {
            return Err(FlowError::new("INVALID_PIPELINE",
                format!("Pipeline '{}' has {} error(s):\n  - {}", self.name, errors.len(), errors.join("\n  - "))));
        }
        Ok(Pipeline {
            name: self.name,
            steps: self.steps,
            initially_available: self.initially_available.into_iter().collect(),
            strict_mode: false,
        })
    }
}
