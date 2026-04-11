package org.unlaxer.tramli.plugins.subflow;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;

import java.util.LinkedHashSet;
import java.util.Set;

public final class GuaranteedSubflowValidator {
    public <S extends Enum<S> & FlowState, T extends Enum<T> & FlowState> void validate(
            FlowDefinition<S> parent,
            S parentState,
            FlowDefinition<T> subflow,
            Set<Class<?>> guaranteedTypes) {

        Set<Class<?>> available = new LinkedHashSet<>(parent.dataFlowGraph().availableAt(parentState));
        available.addAll(guaranteedTypes);
        Set<Class<?>> requiredAtEntry = subflow.dataFlowGraph().availableAt(subflow.initialState());
        if (!available.containsAll(requiredAtEntry)) {
            Set<Class<?>> missing = new LinkedHashSet<>(requiredAtEntry);
            missing.removeAll(available);
            throw new IllegalStateException("Subflow " + subflow.name() + " is missing guaranteed types at entry: " + missing);
        }
    }
}
