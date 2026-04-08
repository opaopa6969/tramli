package org.unlaxer.tramli;

import java.util.Set;

/**
 * Processes a state transition. 1 transition = 1 processor (principle).
 *
 * <h3>Contract</h3>
 * <ul>
 *   <li>Processors SHOULD be fast and avoid external I/O. External interactions
 *       belong in {@link TransitionGuard} or external transitions.</li>
 *   <li>If a processor throws, the engine restores context to its pre-execution
 *       state and routes to the error transition.</li>
 *   <li>{@link #requires()} types MUST be present in context. Validated at build time.</li>
 *   <li>{@link #produces()} types are added to context. Use dedicated record types
 *       as keys, not primitives or String.</li>
 * </ul>
 */
public interface StateProcessor extends ProcessorContract {
    // All methods inherited from ProcessorContract.
    // StateProcessor exists for semantic clarity in FlowDefinition context.
}
