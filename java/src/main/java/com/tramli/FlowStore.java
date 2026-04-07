package com.tramli;

import java.util.Optional;

/**
 * Persistence contract for flow instances.
 *
 * <h3>Threading</h3>
 * FlowEngine assumes single-threaded access per flow instance.
 * Implementations MUST ensure that concurrent calls to
 * {@link #loadForUpdate} for the same flowId are serialized
 * (e.g., SELECT FOR UPDATE, or application-level locking).
 *
 * <h3>Atomicity</h3>
 * {@link #create}/{@link #save} and {@link #recordTransition} calls between
 * them form a logical unit. Implementations SHOULD execute them within a
 * single transaction where possible. If partial writes occur, the flow state
 * ({@link #save}) is authoritative over the transition log.
 *
 * <h3>Optimistic Locking</h3>
 * {@link FlowInstance#version()} supports optimistic locking. Implementations
 * SHOULD increment version on {@link #save} and reject saves with stale versions.
 *
 * <h3>Serialization</h3>
 * {@link FlowInstance} contains a {@link FlowDefinition} reference which holds
 * lambdas and cannot be serialized. Persist only the instance metadata and use
 * {@link FlowInstance#restore} to reconstruct at load time, re-attaching the
 * current {@link FlowDefinition}. For {@link FlowContext} attributes, serialize
 * using {@code Class.getName()} as key and your chosen format for values.
 */
public interface FlowStore {
    void create(FlowInstance<?> flow);

    <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(
            String flowId, FlowDefinition<S> definition);

    void save(FlowInstance<?> flow);

    void recordTransition(String flowId, FlowState from, FlowState to,
                          String trigger, FlowContext ctx);
}
