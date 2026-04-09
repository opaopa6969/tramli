use std::sync::{Arc, Mutex};
use std::time::Instant;
use tramli::{FlowEngine, FlowState};
use crate::api::PluginDescriptor;

/// Telemetry event type.
#[derive(Debug, Clone)]
pub enum TelemetryType {
    Transition,
    Guard,
    Error,
    State,
}

/// A telemetry event captured by the observability plugin.
#[derive(Debug, Clone)]
pub struct TelemetryEvent {
    pub event_type: TelemetryType,
    pub flow_id: String,
    pub flow_name: String,
    pub data: String,
    pub timestamp: Instant,
    pub duration_micros: u64,
}

/// Telemetry sink trait.
pub trait TelemetrySink: Send + Sync {
    fn emit(&self, event: TelemetryEvent);
    fn events(&self) -> Vec<TelemetryEvent>;
}

/// In-memory telemetry sink.
pub struct InMemoryTelemetrySink {
    log: Mutex<Vec<TelemetryEvent>>,
}

impl InMemoryTelemetrySink {
    pub fn new() -> Self {
        Self { log: Mutex::new(Vec::new()) }
    }
}

impl Default for InMemoryTelemetrySink {
    fn default() -> Self {
        Self::new()
    }
}

impl TelemetrySink for InMemoryTelemetrySink {
    fn emit(&self, event: TelemetryEvent) {
        self.log.lock().unwrap().push(event);
    }

    fn events(&self) -> Vec<TelemetryEvent> {
        self.log.lock().unwrap().clone()
    }
}

/// Observability engine plugin — installs transition/error logger hooks.
pub struct ObservabilityPlugin {
    sink: Arc<dyn TelemetrySink>,
}

impl ObservabilityPlugin {
    pub fn new(sink: Arc<dyn TelemetrySink>) -> Self {
        Self { sink }
    }

    pub fn descriptor(&self) -> PluginDescriptor {
        PluginDescriptor {
            id: "observability",
            display_name: "Observability",
            description: "Telemetry via engine logger hooks",
        }
    }

    pub fn install<S: FlowState>(&self, engine: &mut FlowEngine<S>) {
        let sink = self.sink.clone();
        engine.set_transition_logger(move |entry| {
            sink.emit(TelemetryEvent {
                event_type: TelemetryType::Transition,
                flow_id: entry.flow_id.clone(),
                flow_name: entry.flow_name.clone(),
                data: format!("{} -> {} via {}", entry.from, entry.to, entry.trigger),
                timestamp: Instant::now(),
                duration_micros: entry.duration_micros,
            });
        });

        let sink = self.sink.clone();
        engine.set_error_logger(move |entry| {
            sink.emit(TelemetryEvent {
                event_type: TelemetryType::Error,
                flow_id: entry.flow_id.clone(),
                flow_name: entry.flow_name.clone(),
                data: format!("{} -> {} error: {:?}", entry.from, entry.to, entry.cause),
                timestamp: Instant::now(),
                duration_micros: entry.duration_micros,
            });
        });

        let sink = self.sink.clone();
        engine.set_guard_logger(move |entry| {
            sink.emit(TelemetryEvent {
                event_type: TelemetryType::Guard,
                flow_id: entry.flow_id.clone(),
                flow_name: entry.flow_name.clone(),
                data: format!("guard {} at {}: {}", entry.guard_name, entry.state, entry.result),
                timestamp: Instant::now(),
                duration_micros: entry.duration_micros,
            });
        });
    }
}
