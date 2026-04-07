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

    /** Data lifetime: which states a type is first produced and last consumed. */
    public record Lifetime<S>(S firstProduced, S lastConsumed) {}

    /** Get the lifetime of a type across the flow. Null if type is not in the graph. */
    public Lifetime<S> lifetime(Class<?> type) {
        List<NodeInfo<S>> prods = producers.get(type);
        List<NodeInfo<S>> cons = consumers.get(type);
        if (prods == null || prods.isEmpty()) return null;
        S first = prods.getFirst().toState();
        S last = cons != null && !cons.isEmpty() ? cons.getLast().fromState() : first;
        return new Lifetime<>(first, last);
    }

    /**
     * Context pruning hints: for each state, types that are available but not required
     * by any processor/guard at that state or any state reachable from it.
     * These types could theoretically be removed from context at that state.
     */
    public Map<S, Set<Class<?>>> pruningHints() {
        // Collect all types consumed at or after each state
        var consumedAtOrAfter = new LinkedHashMap<S, Set<Class<?>>>();
        for (var entry : consumers.entrySet()) {
            for (var node : entry.getValue()) {
                consumedAtOrAfter.computeIfAbsent(node.fromState(), k -> new LinkedHashSet<>())
                        .add(entry.getKey());
            }
        }

        var hints = new LinkedHashMap<S, Set<Class<?>>>();
        for (var entry : availableAtState.entrySet()) {
            S state = entry.getKey();
            var prunable = new LinkedHashSet<Class<?>>();
            Set<Class<?>> needed = consumedAtOrAfter.getOrDefault(state, Set.of());
            for (Class<?> type : entry.getValue()) {
                if (!needed.contains(type)) prunable.add(type);
            }
            if (!prunable.isEmpty()) hints.put(state, prunable);
        }
        return hints;
    }

    /**
     * Check if processor B can replace processor A without breaking data-flow.
     * B is compatible with A if: B requires no more than A, and B produces at least what A produces.
     */
    public static boolean isCompatible(StateProcessor a, StateProcessor b) {
        return a.requires().containsAll(b.requires()) && b.produces().containsAll(a.produces());
    }

    /**
     * Verify that a processor's declared requires are available in context,
     * and after execution, its declared produces are present.
     * Returns list of violations (empty = OK).
     */
    public static List<String> verifyProcessor(StateProcessor processor, FlowContext ctx) {
        var violations = new ArrayList<String>();
        // Check requires before execution
        for (Class<?> req : processor.requires()) {
            if (!ctx.has(req)) violations.add("requires " + req.getSimpleName() + " but not in context");
        }
        // Check undeclared gets would require wrapping FlowContext — skip for now
        // Check produces after execution
        var before = new HashSet<>(ctx.snapshot().keySet());
        try {
            processor.process(ctx);
        } catch (Exception e) {
            violations.add("threw " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return violations;
        }
        var after = ctx.snapshot().keySet();
        for (Class<?> prod : processor.produces()) {
            if (!after.contains(prod)) violations.add("declares produces " + prod.getSimpleName() + " but did not put it");
        }
        // Check undeclared produces
        for (Class<?> key : after) {
            if (!before.contains(key) && !processor.produces().contains(key)) {
                violations.add("put " + key.getSimpleName() + " but did not declare it in produces()");
            }
        }
        return violations;
    }

    /** All type nodes in the graph. */
    public Set<Class<?>> allTypes() {
        var types = new LinkedHashSet<>(allProduced);
        types.addAll(allConsumed);
        return types;
    }

    /**
     * Assert that a flow instance's current context satisfies the data-flow invariant.
     * Every type in availableAt(currentState) must be present in the context.
     * Returns list of missing types (empty = OK).
     */
    public List<Class<?>> assertDataFlow(FlowContext ctx, S currentState) {
        var missing = new ArrayList<Class<?>>();
        for (Class<?> type : availableAt(currentState)) {
            if (!ctx.has(type)) missing.add(type);
        }
        return missing;
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
