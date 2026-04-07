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

        // If actively in a sub-flow, delegate resume to it
        if (flow.activeSubFlow() != null) {
            return resumeSubFlow(flow, definition, externalData);
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
                        handleError(flow, currentState, e);
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

            // Check for sub-flow transition first
            Transition<S> subFlowT = transitions.stream()
                    .filter(Transition::isSubFlow).findFirst().orElse(null);
            if (subFlowT != null) {
                int advanced = executeSubFlow(flow, subFlowT, depth);
                depth += advanced;
                if (advanced == 0) break; // sub-flow stopped at external — parent stops too
                continue;
            }

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
                handleError(flow, flow.currentState(), e);
                return;
            }
            depth++;
        }
        if (depth >= MAX_CHAIN_DEPTH) throw FlowException.maxChainDepth();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private <S extends Enum<S> & FlowState> FlowInstance<S> resumeSubFlow(
            FlowInstance<S> parentFlow, FlowDefinition<S> parentDef, Map<Class<?>, Object> externalData) {

        FlowInstance subFlow = parentFlow.activeSubFlow();
        FlowDefinition subDef = subFlow.definition();

        for (var entry : externalData.entrySet()) {
            putRaw(parentFlow.context(), entry.getKey(), entry.getValue());
        }

        Enum subCurrent = (Enum) subFlow.currentState();
        var externalOpt = subDef.externalFrom((Enum & FlowState) subCurrent);
        if (externalOpt.isEmpty()) {
            throw new FlowException("INVALID_TRANSITION",
                    "No external transition from sub-flow state " + subCurrent.name());
        }

        Transition transition = (Transition) externalOpt.get();
        TransitionGuard guard = transition.guard();
        FlowState subTo = (FlowState) transition.to();

        if (guard != null) {
            var output = guard.validate(parentFlow.context());
            if (output instanceof TransitionGuard.GuardOutput.Accepted accepted) {
                for (var entry : accepted.data().entrySet()) {
                    putRaw(parentFlow.context(), entry.getKey(), entry.getValue());
                }
                subFlow.transitionTo(transition.to());
                store.recordTransition(parentFlow.id(), (FlowState) subCurrent, subTo,
                        guard.name(), parentFlow.context());
            } else if (output instanceof TransitionGuard.GuardOutput.Rejected) {
                subFlow.incrementGuardFailure();
                if (subFlow.guardFailureCount() >= subDef.maxGuardRetries()) {
                    subFlow.complete("ERROR");
                }
                store.save(parentFlow);
                return parentFlow;
            } else {
                parentFlow.complete("EXPIRED");
                store.save(parentFlow);
                return parentFlow;
            }
        } else {
            subFlow.transitionTo(transition.to());
        }

        executeAutoChain(subFlow);

        if (subFlow.isCompleted()) {
            parentFlow.setActiveSubFlow(null);
            Transition subFlowT = parentDef.transitionsFrom(parentFlow.currentState()).stream()
                    .filter(Transition::isSubFlow).findFirst().orElse(null);
            if (subFlowT != null) {
                S target = (S) subFlowT.exitMappings().get(subFlow.exitState());
                if (target != null) {
                    S from = parentFlow.currentState();
                    parentFlow.transitionTo(target);
                    store.recordTransition(parentFlow.id(), from, target,
                            "subFlow:" + subDef.name() + "/" + subFlow.exitState(), parentFlow.context());
                    executeAutoChain(parentFlow);
                }
            }
        }

        store.save(parentFlow);
        return parentFlow;
    }

    @SuppressWarnings("unchecked")
    private <S extends Enum<S> & FlowState> int executeSubFlow(
            FlowInstance<S> parentFlow, Transition<S> subFlowTransition, int currentDepth) {

        FlowDefinition<?> subDef = subFlowTransition.subFlowDefinition();
        Map<String, S> exitMappings = subFlowTransition.exitMappings();

        // Create sub-flow instance sharing the parent's context
        var subInitial = subDef.initialState();
        var subFlow = new FlowInstance(parentFlow.id(), parentFlow.sessionId(),
                subDef, parentFlow.context(), subInitial, parentFlow.expiresAt());
        parentFlow.setActiveSubFlow(subFlow);

        // Execute sub-flow auto-chain (recursive)
        executeAutoChain((FlowInstance) subFlow);

        // If sub-flow completed (reached terminal), map exit to parent state
        if (subFlow.isCompleted()) {
            parentFlow.setActiveSubFlow(null);
            S parentTarget = exitMappings.get(subFlow.exitState());
            if (parentTarget != null) {
                S from = parentFlow.currentState();
                parentFlow.transitionTo(parentTarget);
                store.recordTransition(parentFlow.id(), from, parentTarget,
                        "subFlow:" + subDef.name() + "/" + subFlow.exitState(), parentFlow.context());
                return 1;
            }
            // Error bubbling: if no exit mapping found (e.g. sub-flow error),
            // fall back to parent's error transitions
            handleError(parentFlow, parentFlow.currentState());
            return 1;
        }
        // Sub-flow stopped at external — parent also stops
        return 0;
    }

    private <S extends Enum<S> & FlowState> void handleError(FlowInstance<S> flow, S fromState) {
        handleError(flow, fromState, null);
    }

    private <S extends Enum<S> & FlowState> void handleError(FlowInstance<S> flow, S fromState, Exception cause) {
        if (cause != null) {
            flow.setLastError(cause.getClass().getSimpleName() + ": " + cause.getMessage());
        }
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
