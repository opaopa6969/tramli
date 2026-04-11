package org.unlaxer.tramli;

public class FlowException extends RuntimeException {
    private final String code;
    private FlowErrorType errorType;
    private java.util.Set<Class<?>> availableTypes;
    private java.util.Set<Class<?>> missingTypes;

    public FlowException(String code, String message) {
        super(message);
        this.code = code;
    }

    public FlowException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() { return code; }

    /** Error type classification for retry/recovery strategy. */
    public FlowErrorType errorType() { return errorType; }

    /** Attach error type classification. */
    public FlowException withErrorType(FlowErrorType type) {
        this.errorType = type;
        return this;
    }

    /** Types that were available in context when the error occurred. */
    public java.util.Set<Class<?>> availableTypes() { return availableTypes; }

    /** Types that were expected but missing (if applicable). */
    public java.util.Set<Class<?>> missingTypes() { return missingTypes; }

    /** Attach context snapshot to this exception. */
    public FlowException withContextSnapshot(java.util.Set<Class<?>> available, java.util.Set<Class<?>> missing) {
        this.availableTypes = available;
        this.missingTypes = missing;
        return this;
    }

    public static FlowException invalidTransition(FlowState from, FlowState to) {
        return new FlowException("INVALID_TRANSITION",
                "No transition from " + from.name() + " to " + to.name());
    }

    public static FlowException missingContext(Class<?> key) {
        return new FlowException("MISSING_CONTEXT",
                "Required context missing: " + key.getSimpleName());
    }

    public static FlowException dagCycle(String detail) {
        return new FlowException("DAG_CYCLE", "Auto/Branch transitions contain a cycle: " + detail);
    }

    public static FlowException maxChainDepth() {
        return new FlowException("MAX_CHAIN_DEPTH", "Auto chain exceeded max depth (10)");
    }

    public static FlowException flowNotFound(String flowId) {
        return new FlowException("FLOW_NOT_FOUND", "Flow " + flowId + " not found");
    }

    public static FlowException flowAlreadyCompleted(String flowId, String exitState) {
        return new FlowException("FLOW_ALREADY_COMPLETED",
                "Flow " + flowId + " already completed with exit state: " + exitState);
    }

    public static FlowException flowExpired(String flowId) {
        return new FlowException("FLOW_EXPIRED", "Flow " + flowId + " has expired (TTL exceeded)");
    }
}
