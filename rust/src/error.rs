use std::fmt;

#[derive(Debug)]
pub struct FlowError {
    pub code: &'static str,
    pub message: String,
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl FlowError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), source: None }
    }

    pub fn with_source(code: &'static str, message: impl Into<String>, source: impl std::error::Error + Send + Sync + 'static) -> Self {
        Self { code, message: message.into(), source: Some(Box::new(source)) }
    }

    pub fn invalid_transition(from: &str, to: &str) -> Self {
        Self::new("INVALID_TRANSITION", format!("Invalid transition from {from} to {to}"))
    }

    pub fn missing_context(type_name: &str) -> Self {
        Self::new("MISSING_CONTEXT", format!("Missing context key: {type_name}"))
    }

    pub fn dag_cycle(detail: &str) -> Self {
        Self::new("DAG_CYCLE", format!("Auto/Branch transitions contain a cycle: {detail}"))
    }

    pub fn max_chain_depth() -> Self {
        Self::new("MAX_CHAIN_DEPTH", "Auto-chain exceeded maximum depth of 10")
    }
}

impl fmt::Display for FlowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for FlowError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
    }
}
