package org.unlaxer.tramli;

import java.util.Map;
import java.util.Set;

/**
 * Guards an External transition. Pure function — must not mutate FlowContext.
 * Accepted data is merged into context by the engine.
 *
 * <h3>TTL vs GuardOutput.Expired</h3>
 * {@link FlowInstance} TTL is checked at {@code resumeAndExecute} entry and represents
 * the flow-level expiration. {@link GuardOutput.Expired} is a guard-level expiration
 * for business logic (e.g., payment window closed). They are independent mechanisms.
 *
 * <h3>maxRetries()</h3>
 * Currently unused by FlowEngine — the engine uses {@link FlowDefinition#maxGuardRetries()}
 * for all guards. Per-guard retry limits are planned for a future version.
 */
public interface TransitionGuard {
    String name();
    Set<Class<?>> requires();
    Set<Class<?>> produces();
    int maxRetries();
    GuardOutput validate(FlowContext ctx);

    sealed interface GuardOutput permits GuardOutput.Accepted, GuardOutput.Rejected, GuardOutput.Expired {
        record Accepted(Map<Class<?>, Object> data) implements GuardOutput {
            public Accepted() { this(Map.of()); }
        }
        record Rejected(String reason) implements GuardOutput {}
        record Expired() implements GuardOutput {}
    }
}
