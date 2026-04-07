package com.tramli;

import java.util.Map;

/**
 * A single transition in a flow definition.
 */
public record Transition<S extends Enum<S> & FlowState>(
        S from,
        S to,
        TransitionType type,
        StateProcessor processor,
        TransitionGuard guard,
        BranchProcessor branch,
        Map<String, S> branchTargets,
        FlowDefinition<?> subFlowDefinition,
        Map<String, S> exitMappings
) {
    /** Backwards-compatible constructor without subFlow fields. */
    public Transition(S from, S to, TransitionType type, StateProcessor processor,
                      TransitionGuard guard, BranchProcessor branch, Map<String, S> branchTargets) {
        this(from, to, type, processor, guard, branch, branchTargets, null, Map.of());
    }

    public boolean isAuto() { return type == TransitionType.AUTO; }
    public boolean isExternal() { return type == TransitionType.EXTERNAL; }
    public boolean isBranch() { return type == TransitionType.BRANCH; }
    public boolean isSubFlow() { return type == TransitionType.SUB_FLOW; }
}
