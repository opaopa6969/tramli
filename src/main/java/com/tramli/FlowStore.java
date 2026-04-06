package com.tramli;

import java.util.Optional;

/**
 * Persistence interface for flow instances.
 * Implementations: InMemoryFlowStore (testing), JdbcFlowStore (production).
 */
public interface FlowStore {
    void create(FlowInstance<?> flow);

    <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(
            String flowId, FlowDefinition<S> definition);

    void save(FlowInstance<?> flow);

    void recordTransition(String flowId, FlowState from, FlowState to,
                          String trigger, FlowContext ctx);
}
