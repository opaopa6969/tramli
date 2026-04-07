package com.tramli;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Generic engine that drives all flow state machines.
 *
 * <h3>Exceptions</h3>
 * <ul>
 *   <li>{@code FLOW_NOT_FOUND} — {@link #resumeAndExecute} with unknown or completed flowId</li>
 *   <li>{@code INVALID_TRANSITION} — {@link #resumeAndExecute} when no external transition exists</li>
 *   <li>{@code MAX_CHAIN_DEPTH} — auto-chain exceeded 10 steps</li>
 *   <li>{@code EXPIRED} — flow TTL exceeded at {@link #resumeAndExecute} entry</li>
 * </ul>
 * Processor and branch exceptions are caught and routed to error transitions.
 * Context is restored to its pre-execution state before error routing.
 */
public final class FlowEngine {
    private static final int MAX_CHAIN_DEPTH = 10;

    private final FlowStore store;

    public FlowEngine(FlowStore store) {
        this.store = store;
    }

    public <S extends Enum<S> & FlowState> FlowInstance<S> startFlow(
            FlowDefinition<S> definition, String sessionId, Map<Class<?>, Object> initialData) {

        String flowId = UUID.randomUUID().toString();
        FlowContext ctx = new FlowContext(flowId);
        for (var entry : initialData.entrySet()) {
            putRaw(ctx, entry.getKey(), entry.getValue());
        }

        S initial = definition.initialState();
        Instant expiresAt = Instant.now().plus(definition.ttl());
        var flow = new FlowInstance<>(flowId, sessionId, definition, ctx, initial, expiresAt);

        store.create(flow);
        executeAutoChain(flow);
        store.save(flow);
        return flow;
    }

    public <S extends Enum<S> & FlowState> FlowInstance<S> resumeAndExecute(
            String flowId, FlowDefinition<S> definition) {
        return resumeAndExecute(flowId, definition, Map.of());
    }

    public <S extends Enum<S> & FlowState> FlowInstance<S> resumeAndExecute(
            String flowId, FlowDefinition<S> definition, Map<Class<?>, Object> externalData) {

        var flowOpt = store.loadForUpdate(flowId, definition);
        if (flowOpt.isEmpty()) {
            throw new FlowException("FLOW_NOT_FOUND", "Flow " + flowId + " not found or already completed");
        }
        var flow = flowOpt.get();

        for (var entry : externalData.entrySet()) {
            putRaw(flow.context(), entry.getKey(), entry.getValue());
        }

        if (Instant.now().isAfter(flow.expiresAt())) {
            flow.complete("EXPIRED");
            store.save(flow);
            return flow;
        }

        S currentState = flow.currentState();
        var externalOpt = definition.externalFrom(currentState);
        if (externalOpt.isEmpty()) {
            throw FlowException.invalidTransition(currentState, currentState);
        }

        Transition<S> transition = externalOpt.get();
        TransitionGuard guard = transition.guard();

        if (guard != null) {
            TransitionGuard.GuardOutput output = guard.validate(flow.context());
            switch (output) {
                case TransitionGuard.GuardOutput.Accepted accepted -> {
                    Map<Class<?>, Object> backup = flow.context().snapshot();
                    for (var entry : accepted.data().entrySet()) {
                        putRaw(flow.context(), entry.getKey(), entry.getValue());
                    }
                    try {
                        if (transition.processor() != null) {
                            transition.processor().process(flow.context());
                        }
                        S from = flow.currentState();
                        flow.transitionTo(transition.to());
                        store.recordTransition(flow.id(), from, transition.to(), guard.name(), flow.context());
                    } catch (Exception e) {
                        flow.context().restoreFrom(backup);
                        handleError(flow, currentState);
                        store.save(flow);
                        return flow;
                    }
                }
                case TransitionGuard.GuardOutput.Rejected rejected -> {
                    flow.incrementGuardFailure();
                    if (flow.guardFailureCount() >= definition.maxGuardRetries()) {
                        handleError(flow, currentState);
                    }
                    store.save(flow);
                    return flow;
                }
                case TransitionGuard.GuardOutput.Expired ignored -> {
                    flow.complete("EXPIRED");
                    store.save(flow);
                    return flow;
                }
            }
        } else {
            S from = flow.currentState();
            flow.transitionTo(transition.to());
            store.recordTransition(flow.id(), from, transition.to(), "external", flow.context());
        }

        executeAutoChain(flow);
        store.save(flow);
        return flow;
    }

    private <S extends Enum<S> & FlowState> void executeAutoChain(FlowInstance<S> flow) {
        int depth = 0;
        while (depth < MAX_CHAIN_DEPTH) {
            S current = flow.currentState();
            if (current.isTerminal()) {
                flow.complete(current.name());
                break;
            }

            List<Transition<S>> transitions = flow.definition().transitionsFrom(current);
            Transition<S> autoOrBranch = transitions.stream()
                    .filter(t -> t.isAuto() || t.isBranch())
                    .findFirst().orElse(null);

            if (autoOrBranch == null) break;

            Map<Class<?>, Object> backup = flow.context().snapshot();
            try {
                if (autoOrBranch.isAuto()) {
                    if (autoOrBranch.processor() != null) autoOrBranch.processor().process(flow.context());
                    S from = flow.currentState();
                    flow.transitionTo(autoOrBranch.to());
                    store.recordTransition(flow.id(), from, autoOrBranch.to(),
                            autoOrBranch.processor() != null ? autoOrBranch.processor().name() : "auto",
                            flow.context());
                } else {
                    BranchProcessor branch = autoOrBranch.branch();
                    String label = branch.decide(flow.context());
                    S target = autoOrBranch.branchTargets().get(label);
                    if (target == null) {
                        throw new FlowException("UNKNOWN_BRANCH",
                                "Branch '" + branch.name() + "' returned unknown label: " + label);
                    }
                    Transition<S> specific = transitions.stream()
                            .filter(t -> t.isBranch() && t.to() == target)
                            .findFirst().orElse(autoOrBranch);
                    if (specific.processor() != null) specific.processor().process(flow.context());
                    S from = flow.currentState();
                    flow.transitionTo(target);
                    store.recordTransition(flow.id(), from, target, branch.name() + ":" + label, flow.context());
                }
            } catch (Exception e) {
                flow.context().restoreFrom(backup);
                handleError(flow, flow.currentState());
                return;
            }
            depth++;
        }
        if (depth >= MAX_CHAIN_DEPTH) throw FlowException.maxChainDepth();
    }

    private <S extends Enum<S> & FlowState> void handleError(FlowInstance<S> flow, S fromState) {
        S errorTarget = flow.definition().errorTransitions().get(fromState);
        if (errorTarget != null) {
            S from = flow.currentState();
            flow.transitionTo(errorTarget);
            store.recordTransition(flow.id(), from, errorTarget, "error", flow.context());
            if (errorTarget.isTerminal()) flow.complete(errorTarget.name());
        } else {
            flow.complete("TERMINAL_ERROR");
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void putRaw(FlowContext ctx, Class key, Object value) {
        ctx.put(key, value);
    }
}
