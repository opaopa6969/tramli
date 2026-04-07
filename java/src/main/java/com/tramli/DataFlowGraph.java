package com.tramli;

import java.util.*;

/**
 * Bipartite graph of data types and processors/guards derived from a FlowDefinition.
 * Built automatically during FlowDefinition.build().
 *
 * <p>Type nodes represent data types (Class&lt;?&gt;). Processing nodes represent
 * processors, guards, or branch processors. Edges are "requires" (type → processing)
 * and "produces" (processing → type).
 */
public final class DataFlowGraph<S extends Enum<S> & FlowState> {

    /** Info about a processor/guard that produces or consumes a type. */
    public record NodeInfo<S>(String name, S fromState, S toState, String kind) {}

    private final Map<S, Set<Class<?>>> availableAtState;
    private final Map<Class<?>, List<NodeInfo<S>>> producers;
    private final Map<Class<?>, List<NodeInfo<S>>> consumers;
    private final Set<Class<?>> allProduced;
    private final Set<Class<?>> allConsumed;

    private DataFlowGraph(Map<S, Set<Class<?>>> availableAtState,
                          Map<Class<?>, List<NodeInfo<S>>> producers,
                          Map<Class<?>, List<NodeInfo<S>>> consumers,
                          Set<Class<?>> allProduced,
                          Set<Class<?>> allConsumed) {
        this.availableAtState = Collections.unmodifiableMap(availableAtState);
        this.producers = Collections.unmodifiableMap(producers);
        this.consumers = Collections.unmodifiableMap(consumers);
        this.allProduced = Collections.unmodifiableSet(allProduced);
        this.allConsumed = Collections.unmodifiableSet(allConsumed);
    }

    /** Data types available in context when the flow reaches the given state. */
    public Set<Class<?>> availableAt(S state) {
        return availableAtState.getOrDefault(state, Set.of());
    }

    /** Processors/guards that produce the given type. */
    public List<NodeInfo<S>> producersOf(Class<?> type) {
        return producers.getOrDefault(type, List.of());
    }

    /** Processors/guards that consume (require) the given type. */
    public List<NodeInfo<S>> consumersOf(Class<?> type) {
        return consumers.getOrDefault(type, List.of());
    }

    /** Types that are produced but never required by any downstream processor/guard. */
    public Set<Class<?>> deadData() {
        var dead = new LinkedHashSet<>(allProduced);
        dead.removeAll(allConsumed);
        return dead;
    }

    /** All type nodes in the graph. */
    public Set<Class<?>> allTypes() {
        var types = new LinkedHashSet<>(allProduced);
        types.addAll(allConsumed);
        return types;
    }

    /** Generate Mermaid data-flow diagram. */
    public String toMermaid() {
        var sb = new StringBuilder();
        sb.append("flowchart LR\n");
        var seen = new LinkedHashSet<String>();

        for (var entry : producers.entrySet()) {
            String typeName = entry.getKey().getSimpleName();
            for (var node : entry.getValue()) {
                String edge = node.name + " -->|produces| " + typeName;
                if (seen.add(edge)) sb.append("    ").append(edge).append('\n');
            }
        }
        for (var entry : consumers.entrySet()) {
            String typeName = entry.getKey().getSimpleName();
            for (var node : entry.getValue()) {
                String edge = typeName + " -->|requires| " + node.name;
                if (seen.add(edge)) sb.append("    ").append(edge).append('\n');
            }
        }
        return sb.toString();
    }

    // ─── Builder ─────────────────────────────────────────────

    static <S extends Enum<S> & FlowState> DataFlowGraph<S> build(
            FlowDefinition<S> def, Set<Class<?>> initiallyAvailable) {
        Class<S> stateClass = def.stateClass();
        Map<S, Set<Class<?>>> stateAvail = new EnumMap<>(stateClass);
        Map<Class<?>, List<NodeInfo<S>>> producers = new LinkedHashMap<>();
        Map<Class<?>, List<NodeInfo<S>>> consumers = new LinkedHashMap<>();
        Set<Class<?>> allProduced = new LinkedHashSet<>(initiallyAvailable);
        Set<Class<?>> allConsumed = new LinkedHashSet<>();

        if (def.initialState() != null) {
            traverse(def, def.initialState(), new HashSet<>(initiallyAvailable),
                    stateAvail, producers, consumers, allProduced, allConsumed);
        }

        // Mark initially available types as produced by "initial"
        for (Class<?> type : initiallyAvailable) {
            producers.computeIfAbsent(type, k -> new ArrayList<>())
                    .add(new NodeInfo<>("initial", def.initialState(), def.initialState(), "initial"));
        }

        return new DataFlowGraph<>(stateAvail, producers, consumers, allProduced, allConsumed);
    }

    private static <S extends Enum<S> & FlowState> void traverse(
            FlowDefinition<S> def, S state, Set<Class<?>> available,
            Map<S, Set<Class<?>>> stateAvail,
            Map<Class<?>, List<NodeInfo<S>>> producers,
            Map<Class<?>, List<NodeInfo<S>>> consumers,
            Set<Class<?>> allProduced, Set<Class<?>> allConsumed) {
        if (stateAvail.containsKey(state)) {
            Set<Class<?>> existing = stateAvail.get(state);
            if (existing.containsAll(available)) return;
            existing.retainAll(available);
        } else {
            stateAvail.put(state, new HashSet<>(available));
        }

        for (Transition<S> t : def.transitionsFrom(state)) {
            Set<Class<?>> newAvail = new HashSet<>(stateAvail.get(state));

            if (t.guard() != null) {
                for (Class<?> req : t.guard().requires()) {
                    consumers.computeIfAbsent(req, k -> new ArrayList<>())
                            .add(new NodeInfo<>(t.guard().name(), t.from(), t.to(), "guard"));
                    allConsumed.add(req);
                }
                for (Class<?> prod : t.guard().produces()) {
                    producers.computeIfAbsent(prod, k -> new ArrayList<>())
                            .add(new NodeInfo<>(t.guard().name(), t.from(), t.to(), "guard"));
                    allProduced.add(prod);
                    newAvail.add(prod);
                }
            }
            if (t.branch() != null) {
                for (Class<?> req : t.branch().requires()) {
                    consumers.computeIfAbsent(req, k -> new ArrayList<>())
                            .add(new NodeInfo<>(t.branch().name(), t.from(), t.to(), "branch"));
                    allConsumed.add(req);
                }
            }
            if (t.processor() != null) {
                for (Class<?> req : t.processor().requires()) {
                    consumers.computeIfAbsent(req, k -> new ArrayList<>())
                            .add(new NodeInfo<>(t.processor().name(), t.from(), t.to(), "processor"));
                    allConsumed.add(req);
                }
                for (Class<?> prod : t.processor().produces()) {
                    producers.computeIfAbsent(prod, k -> new ArrayList<>())
                            .add(new NodeInfo<>(t.processor().name(), t.from(), t.to(), "processor"));
                    allProduced.add(prod);
                    newAvail.add(prod);
                }
            }

            traverse(def, t.to(), newAvail, stateAvail, producers, consumers, allProduced, allConsumed);
        }
    }
}
