package com.tramli;

import java.time.Instant;

/**
 * Runtime state of a flow execution.
 */
public final class FlowInstance<S extends Enum<S> & FlowState> {
    private final String id;
    private final String sessionId;
    private final FlowDefinition<S> definition;
    private final FlowContext context;
    private S currentState;
    private int guardFailureCount;
    private int version;
    private final Instant createdAt;
    private final Instant expiresAt;
    private String exitState;
    private FlowInstance<?> activeSubFlow;

    public FlowInstance(String id, String sessionId, FlowDefinition<S> definition,
                        FlowContext context, S currentState, Instant expiresAt) {
        this(id, sessionId, definition, context, currentState, Instant.now(), expiresAt, 0, 0, null);
    }

    FlowInstance(String id, String sessionId, FlowDefinition<S> definition,
                 FlowContext context, S currentState, Instant createdAt,
                 Instant expiresAt, int guardFailureCount, int version, String exitState) {
        this.id = id;
        this.sessionId = sessionId;
        this.definition = definition;
        this.context = context;
        this.currentState = currentState;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.guardFailureCount = guardFailureCount;
        this.version = version;
        this.exitState = exitState;
    }

    /**
     * Restore a FlowInstance from persisted state.
     * Used by FlowStore implementations to reconstruct instances loaded from storage.
     *
     * @param createdAt the original creation timestamp (not Instant.now())
     * @param exitState null if the flow is still active
     */
    public static <S extends Enum<S> & FlowState> FlowInstance<S> restore(
            String id, String sessionId, FlowDefinition<S> definition,
            FlowContext context, S currentState, Instant createdAt,
            Instant expiresAt, int guardFailureCount, int version,
            String exitState) {
        return new FlowInstance<>(id, sessionId, definition, context,
                currentState, createdAt, expiresAt, guardFailureCount, version, exitState);
    }

    public String id() { return id; }
    public String sessionId() { return sessionId; }
    public FlowDefinition<S> definition() { return definition; }
    public FlowContext context() { return context; }
    public S currentState() { return currentState; }
    public int guardFailureCount() { return guardFailureCount; }
    public int version() { return version; }
    public Instant createdAt() { return createdAt; }
    public Instant expiresAt() { return expiresAt; }
    public String exitState() { return exitState; }
    public boolean isCompleted() { return exitState != null; }

    /** Active sub-flow instance, or null if not in a sub-flow. */
    public FlowInstance<?> activeSubFlow() { return activeSubFlow; }

    void transitionTo(S newState) { this.currentState = newState; }
    void incrementGuardFailure() { this.guardFailureCount++; }
    void complete(String exitState) { this.exitState = exitState; }
    void setVersion(int version) { this.version = version; }
    void setActiveSubFlow(FlowInstance<?> sub) { this.activeSubFlow = sub; }
}
