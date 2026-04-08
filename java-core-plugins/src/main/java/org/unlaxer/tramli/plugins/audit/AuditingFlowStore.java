package org.unlaxer.tramli.plugins.audit;

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
import java.util.Set;

public final class AuditingFlowStore implements FlowStore {
    private final FlowStore delegate;
    private final ProducedDataSerializer serializer;
    private final List<AuditedTransitionRecord> auditLog = new ArrayList<>();
    private final Map<String, Set<Class<?>>> previousContextKeys = new LinkedHashMap<>();

    public AuditingFlowStore(FlowStore delegate) {
        this(delegate, new DefaultProducedDataSerializer());
    }

    public AuditingFlowStore(FlowStore delegate, ProducedDataSerializer serializer) {
        this.delegate = delegate;
        this.serializer = serializer;
    }

    @Override
    public void create(FlowInstance<?> flow) {
        delegate.create(flow);
        previousContextKeys.put(flow.id(), flow.context().snapshot().keySet());
    }

    @Override
    public <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(String flowId, FlowDefinition<S> definition) {
        return delegate.loadForUpdate(flowId, definition);
    }

    @Override
    public void save(FlowInstance<?> flow) {
        delegate.save(flow);
        previousContextKeys.put(flow.id(), flow.context().snapshot().keySet());
    }

    @Override
    public void recordTransition(String flowId, FlowState from, FlowState to, String trigger, FlowContext ctx) {
        Map<Class<?>, Object> snapshot = ctx.snapshot();
        Set<Class<?>> beforeKeys = previousContextKeys.getOrDefault(flowId, Set.of());
        Map<String, String> produced = new LinkedHashMap<>();
        for (Map.Entry<Class<?>, Object> e : snapshot.entrySet()) {
            if (!beforeKeys.contains(e.getKey())) {
                produced.put(e.getKey().getSimpleName(), serializer.serialize(e.getValue()));
            }
        }
        auditLog.add(new AuditedTransitionRecord(flowId,
                from != null ? from.name() : null,
                to != null ? to.name() : null,
                trigger,
                Instant.now(),
                Map.copyOf(produced)));
        previousContextKeys.put(flowId, snapshot.keySet());
        delegate.recordTransition(flowId, from, to, trigger, ctx);
    }

    public List<AuditedTransitionRecord> auditLog() {
        return Collections.unmodifiableList(auditLog);
    }
}
