package org.unlaxer.tramli;

import java.util.*;

/**
 * Lightweight data-flow analysis for Pipelines.
 */
public final class PipelineDataFlow {
    private final List<PipelineStep> steps;
    private final Set<Class<?>> initiallyAvailable;

    PipelineDataFlow(List<PipelineStep> steps, Set<Class<?>> initiallyAvailable) {
        this.steps = List.copyOf(steps);
        this.initiallyAvailable = Set.copyOf(initiallyAvailable);
    }

    /** Types produced but never required by any downstream step. */
    public Set<Class<?>> deadData() {
        Set<Class<?>> allProduced = new LinkedHashSet<>(initiallyAvailable);
        Set<Class<?>> allConsumed = new LinkedHashSet<>();
        for (var step : steps) {
            allConsumed.addAll(step.requires());
            allProduced.addAll(step.produces());
        }
        var dead = new LinkedHashSet<>(allProduced);
        dead.removeAll(allConsumed);
        return dead;
    }

    /** Step names in execution order. */
    public List<String> stepOrder() {
        return steps.stream().map(PipelineStep::name).toList();
    }

    /** Types available in context after a given step completes. */
    public Set<Class<?>> availableAfter(String stepName) {
        Set<Class<?>> available = new LinkedHashSet<>(initiallyAvailable);
        for (var step : steps) {
            available.addAll(step.produces());
            if (step.name().equals(stepName)) return available;
        }
        return available;
    }

    /** Mermaid data-flow diagram. */
    public String toMermaid() {
        var sb = new StringBuilder("flowchart LR\n");
        String prev = "initial";
        for (var step : steps) {
            for (var req : step.requires()) {
                sb.append("    ").append(req.getSimpleName()).append(" -->|requires| ").append(step.name()).append('\n');
            }
            for (var prod : step.produces()) {
                sb.append("    ").append(step.name()).append(" -->|produces| ").append(prod.getSimpleName()).append('\n');
            }
        }
        return sb.toString();
    }
}
