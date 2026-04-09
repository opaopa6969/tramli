use std::time::Instant;
use tramli::{FlowState, InMemoryFlowStore, FlowInstance};

/// Event type for the append-only log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventType {
    Transition,
    Compensation,
}

/// Versioned transition event.
#[derive(Debug, Clone)]
pub struct VersionedTransitionEvent {
    pub flow_id: String,
    pub version: u32,
    pub event_type: EventType,
    pub from: Option<String>,
    pub to: String,
    pub trigger: String,
    pub timestamp: Instant,
    pub state_snapshot: String,
}

/// Compensation plan returned by resolver.
#[derive(Debug, Clone)]
pub struct CompensationPlan {
    pub action: String,
    pub metadata: String,
}

/// Compensation resolver function type.
pub type CompensationResolver =
    Box<dyn Fn(&VersionedTransitionEvent, &str) -> Option<CompensationPlan> + Send + Sync>;

/// Projection reducer for materialized views.
pub trait ProjectionReducer<T> {
    fn initial_state(&self) -> T;
    fn apply(&self, state: T, event: &VersionedTransitionEvent) -> T;
}

/// Event log store decorator — append-only transition log with replay.
pub struct EventLogStore<S: FlowState> {
    pub delegate: InMemoryFlowStore<S>,
    event_log: Vec<VersionedTransitionEvent>,
    version_counters: std::collections::HashMap<String, u32>,
}

impl<S: FlowState> EventLogStore<S> {
    pub fn new(delegate: InMemoryFlowStore<S>) -> Self {
        Self {
            delegate,
            event_log: Vec::new(),
            version_counters: std::collections::HashMap::new(),
        }
    }

    pub fn create(&mut self, flow: FlowInstance<S>) {
        self.delegate.create(flow);
    }

    pub fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>> {
        self.delegate.get(flow_id)
    }

    pub fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>> {
        self.delegate.get_mut(flow_id)
    }

    pub fn record_transition(
        &mut self, flow_id: &str, from: &str, to: &str, trigger: &str, snapshot: &str,
    ) {
        self.delegate.record_transition(flow_id, from, to, trigger);
        let version = self.version_counters.entry(flow_id.to_string()).or_insert(0);
        *version += 1;
        self.event_log.push(VersionedTransitionEvent {
            flow_id: flow_id.to_string(),
            version: *version,
            event_type: EventType::Transition,
            from: Some(from.to_string()),
            to: to.to_string(),
            trigger: trigger.to_string(),
            timestamp: Instant::now(),
            state_snapshot: snapshot.to_string(),
        });
    }

    pub fn append_compensation(&mut self, flow_id: &str, trigger: &str, metadata: &str) {
        let version = self.version_counters.entry(flow_id.to_string()).or_insert(0);
        *version += 1;
        self.event_log.push(VersionedTransitionEvent {
            flow_id: flow_id.to_string(),
            version: *version,
            event_type: EventType::Compensation,
            from: None,
            to: "COMPENSATED".to_string(),
            trigger: trigger.to_string(),
            timestamp: Instant::now(),
            state_snapshot: metadata.to_string(),
        });
    }

    pub fn events(&self) -> &[VersionedTransitionEvent] {
        &self.event_log
    }

    pub fn events_for_flow(&self, flow_id: &str) -> Vec<&VersionedTransitionEvent> {
        self.event_log.iter().filter(|e| e.flow_id == flow_id).collect()
    }

    pub fn transition_log(&self) -> &[tramli::TransitionRecord] {
        self.delegate.transition_log()
    }

    pub fn clear(&mut self) {
        self.delegate.clear();
        self.event_log.clear();
        self.version_counters.clear();
    }
}

/// Replay service — reconstructs flow state at any version.
///
/// Assumes each TRANSITION event stores a full snapshot of the state.
/// Returns the latest matching state at or before the requested version.
///
/// If the event log is later changed to store diffs instead of full snapshots,
/// use [`ProjectionReplayService`] with a fold/reducer instead.
pub struct ReplayService;

impl ReplayService {
    pub fn state_at_version(events: &[VersionedTransitionEvent], flow_id: &str, target_version: u32) -> Option<String> {
        let mut flow_events: Vec<&VersionedTransitionEvent> = events
            .iter()
            .filter(|e| e.flow_id == flow_id && e.event_type == EventType::Transition && e.version <= target_version)
            .collect();
        flow_events.sort_by_key(|e| e.version);
        flow_events.last().map(|e| e.to.clone())
    }
}

/// Projection replay service — fold/reducer model for custom aggregations.
///
/// Unlike [`ReplayService`] which assumes full snapshots,
/// this service supports both full-snapshot and diff-based event logs.
/// `reducer.initial_state()` returns the empty starting state,
/// `reducer.apply(state, event)` accumulates each event.
///
/// Use for custom aggregations (transition count, cumulative metrics)
/// or when the event log stores diffs rather than full snapshots.
pub struct ProjectionReplayService;

impl ProjectionReplayService {
    pub fn state_at_version<T>(
        events: &[VersionedTransitionEvent],
        flow_id: &str,
        target_version: u32,
        reducer: &dyn ProjectionReducer<T>,
    ) -> T {
        let mut state = reducer.initial_state();
        for event in events {
            if event.flow_id == flow_id && event.version <= target_version {
                state = reducer.apply(state, event);
            }
        }
        state
    }
}

/// Compensation service — records compensation events for failed transitions.
pub struct CompensationService {
    resolver: CompensationResolver,
}

impl CompensationService {
    pub fn new(resolver: CompensationResolver) -> Self {
        Self { resolver }
    }

    pub fn compensate<S: FlowState>(
        &self, event: &VersionedTransitionEvent, cause: &str, store: &mut EventLogStore<S>,
    ) -> bool {
        if let Some(plan) = (self.resolver)(event, cause) {
            store.append_compensation(&event.flow_id, &plan.action, &plan.metadata);
            true
        } else {
            false
        }
    }
}
