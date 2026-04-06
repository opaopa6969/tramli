package com.tramli;

public class FlowException extends RuntimeException {
    private final String code;

    public FlowException(String code, String message) {
        super(message);
        this.code = code;
    }

    public FlowException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() { return code; }

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
}
