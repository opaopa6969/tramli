use std::fmt;
use tramli::{FlowDefinition, FlowEngine, FlowState};

/// Plugin kind classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginKind {
    Analysis,
    Store,
    Engine,
    RuntimeAdapter,
    Generation,
    Documentation,
}

/// Plugin descriptor.
#[derive(Debug, Clone)]
pub struct PluginDescriptor {
    pub id: &'static str,
    pub display_name: &'static str,
    pub description: &'static str,
}

/// A single report finding.
#[derive(Debug, Clone)]
pub struct Finding {
    pub plugin_id: String,
    pub severity: String,
    pub message: String,
}

/// Collects analysis findings across plugins.
#[derive(Debug, Default)]
pub struct PluginReport {
    entries: Vec<Finding>,
}

impl PluginReport {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    pub fn add(&mut self, plugin_id: &str, severity: &str, message: &str) {
        self.entries.push(Finding {
            plugin_id: plugin_id.to_string(),
            severity: severity.to_string(),
            message: message.to_string(),
        });
    }

    pub fn warn(&mut self, plugin_id: &str, message: &str) {
        self.add(plugin_id, "WARN", message);
    }

    pub fn error(&mut self, plugin_id: &str, message: &str) {
        self.add(plugin_id, "ERROR", message);
    }

    pub fn findings(&self) -> &[Finding] {
        &self.entries
    }

    pub fn as_text(&self) -> String {
        if self.entries.is_empty() {
            return "No findings.".to_string();
        }
        self.entries
            .iter()
            .map(|e| format!("[{}] {}: {}", e.severity, e.plugin_id, e.message))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl fmt::Display for PluginReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_text())
    }
}

/// Analysis plugin — static analysis of FlowDefinition.
pub trait AnalysisPlugin<S: FlowState>: Send + Sync {
    fn descriptor(&self) -> PluginDescriptor;
    fn analyze(&self, definition: &FlowDefinition<S>, report: &mut PluginReport);
}

/// Engine plugin — installs hooks on FlowEngine.
pub trait EnginePlugin<S: FlowState>: Send + Sync {
    fn descriptor(&self) -> PluginDescriptor;
    fn install(&self, engine: &mut FlowEngine<S>);
}

/// Runtime adapter plugin — binds FlowEngine to return richer API.
pub trait RuntimeAdapterPlugin<S: FlowState>: Send + Sync {
    fn descriptor(&self) -> PluginDescriptor;
    fn id(&self) -> &str { self.descriptor().id }
}
