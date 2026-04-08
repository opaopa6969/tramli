package org.unlaxer.tramli;

/**
 * Log entry records for tramli's pluggable logger API.
 * Use with {@link FlowEngine#setTransitionLogger}, {@link FlowEngine#setStateLogger},
 * {@link FlowEngine#setErrorLogger}.
 */
public final class LogEntry {
    private LogEntry() {}

    /** Emitted on each state transition. */
    public record Transition(String flowId, String flowName, String from, String to, String trigger) {}

    /** Emitted when context.put() is called (opt-in via setStateLogger). */
    public record State(String flowId, String flowName, String state, Class<?> type, Object value) {
        public String typeName() { return type.getSimpleName(); }
    }

    /** Emitted when a processor throws or strictMode detects a produces violation. */
    public record Error(String flowId, String flowName, String from, String to, String trigger, Throwable cause) {}

    /** Emitted when a guard validates (accepted, rejected, or expired). */
    public record GuardResult(String flowId, String flowName, String state, String guardName, String result, String reason) {}
}
