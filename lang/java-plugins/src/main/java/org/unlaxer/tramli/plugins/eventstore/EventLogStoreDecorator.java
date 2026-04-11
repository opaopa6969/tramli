package org.unlaxer.tramli.plugins.eventstore;

import org.unlaxer.tramli.FlowContext;
import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowInstance;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.FlowStore;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class EventLogStoreDecorator implements FlowStore {
    private final FlowStore delegate;
    private final List<VersionedTransitionEvent> events = new ArrayList<>();
    private final Map<String, Long> versions = new LinkedHashMap<>();

    public EventLogStoreDecorator(FlowStore delegate) {
        this.delegate = delegate;
    }

    @Override
    public void create(FlowInstance<?> flow) {
        delegate.create(flow);
        versions.put(flow.id(), 0L);
    }

    @Override
    public <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(String flowId, FlowDefinition<S> definition) {
        return delegate.loadForUpdate(flowId, definition);
    }

    @Override
    public void save(FlowInstance<?> flow) {
        delegate.save(flow);
    }

    @Override
    public void recordTransition(String flowId, FlowState from, FlowState to, String trigger, FlowContext ctx) {
        long nextVersion = nextVersion(flowId);
        events.add(new VersionedTransitionEvent(
                nextVersion,
                flowId,
                from != null ? from.name() : null,
                to != null ? to.name() : null,
                trigger,
                Instant.now(),
                snapshot(ctx),
                "TRANSITION",
                Map.of()));
        delegate.recordTransition(flowId, from, to, trigger, ctx);
    }

    public void recordCompensation(String flowId, String compensationName, Map<String, Object> metadata) {
        long nextVersion = nextVersion(flowId);
        events.add(new VersionedTransitionEvent(
                nextVersion,
                flowId,
                null,
                null,
                compensationName,
                Instant.now(),
                Map.of(),
                "COMPENSATION",
                Map.copyOf(metadata)));
    }

    public List<VersionedTransitionEvent> events() {
        return Collections.unmodifiableList(events);
    }

    public List<VersionedTransitionEvent> eventsForFlow(String flowId) {
        List<VersionedTransitionEvent> result = new ArrayList<>();
        for (VersionedTransitionEvent event : events) {
            if (flowId.equals(event.flowId())) {
                result.add(event);
            }
        }
        return Collections.unmodifiableList(result);
    }

    private long nextVersion(String flowId) {
        return versions.compute(flowId, (k, v) -> v == null ? 1L : v + 1L);
    }

    private Map<String, Object> snapshot(FlowContext ctx) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        for (Map.Entry<Class<?>, Object> e : ctx.snapshot().entrySet()) {
            snapshot.put(e.getKey().getSimpleName(), e.getValue());
        }
        return snapshot;
    }
}
