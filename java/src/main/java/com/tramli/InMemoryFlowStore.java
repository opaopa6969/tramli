package com.tramli;

import java.time.Instant;
import java.util.*;

/**
 * In-memory FlowStore for testing. No external dependencies.
 */
public final class InMemoryFlowStore implements FlowStore {
    private final Map<String, FlowInstance<?>> flows = new LinkedHashMap<>();
    private final List<TransitionRecord> transitionLog = new ArrayList<>();

    public record TransitionRecord(String flowId, String from, String to, String trigger, String subFlow, Instant timestamp) {}

    @Override
    public void create(FlowInstance<?> flow) {
        flows.put(flow.id(), flow);
    }

    @Override
    @SuppressWarnings("unchecked")
    public <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(
            String flowId, FlowDefinition<S> definition) {
        FlowInstance<?> flow = flows.get(flowId);
        if (flow == null || flow.isCompleted()) return Optional.empty();
        return Optional.of((FlowInstance<S>) flow);
    }

    @Override
    public void save(FlowInstance<?> flow) {
        flows.put(flow.id(), flow);
    }

    @Override
    public void recordTransition(String flowId, FlowState from, FlowState to,
                                 String trigger, FlowContext ctx) {
        // Extract subFlow name from trigger like "subFlow:payment/DONE"
        String subFlowName = trigger.startsWith("subFlow:") ? trigger.substring(8, trigger.indexOf('/')) : null;
        transitionLog.add(new TransitionRecord(flowId,
                from != null ? from.name() : null, to.name(), trigger, subFlowName, Instant.now()));
    }

    /** Clear all flows and transition log. For pool/reuse patterns. */
    public void clear() {
        flows.clear();
        transitionLog.clear();
    }

    /** Load a flow by ID regardless of completion status (read-only access). */
    @SuppressWarnings("unchecked")
    public <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> load(String flowId) {
        FlowInstance<?> flow = flows.get(flowId);
        if (flow == null) return Optional.empty();
        return Optional.of((FlowInstance<S>) flow);
    }

    public List<TransitionRecord> transitionLog() {
        return Collections.unmodifiableList(transitionLog);
    }
}
