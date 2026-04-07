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

    /**
     * Impact analysis: all producers and consumers of a given type.
     * "If I change this type, what processors/guards are affected?"
     */
    public record Impact<S>(List<NodeInfo<S>> producers, List<NodeInfo<S>> consumers) {}

    public Impact<S> impactOf(Class<?> type) {
        return new Impact<>(producersOf(type), consumersOf(type));
    }

    /**
     * Parallelism hints: pairs of processors at the same state that have
     * no data dependency (neither requires the other's produces).
     */
    public List<String[]> parallelismHints() {
        var hints = new ArrayList<String[]>();
        var allNodes = new ArrayList<String>();
        for (var entry : consumers.values()) {
            for (var n : entry) {
                if (!allNodes.contains(n.name())) allNodes.add(n.name());
            }
        }
        for (var entry : producers.values()) {
            for (var n : entry) {
                if (!allNodes.contains(n.name())) allNodes.add(n.name());
            }
        }
        // Find pairs with no overlap
        for (int i = 0; i < allNodes.size(); i++) {
            for (int j = i + 1; j < allNodes.size(); j++) {
                String a = allNodes.get(i), b = allNodes.get(j);
                Set<Class<?>> aProduces = new HashSet<>(), bRequires = new HashSet<>();
                Set<Class<?>> bProduces = new HashSet<>(), aRequires = new HashSet<>();
                for (var e : producers.entrySet()) {
                    for (var n : e.getValue()) {
                        if (n.name().equals(a)) aProduces.add(e.getKey());
                        if (n.name().equals(b)) bProduces.add(e.getKey());
                    }
                }
                for (var e : consumers.entrySet()) {
                    for (var n : e.getValue()) {
                        if (n.name().equals(a)) aRequires.add(e.getKey());
                        if (n.name().equals(b)) bRequires.add(e.getKey());
                    }
                }
                boolean aDepB = aRequires.stream().anyMatch(bProduces::contains);
                boolean bDepA = bRequires.stream().anyMatch(aProduces::contains);
                if (!aDepB && !bDepA) hints.add(new String[]{a, b});
            }
        }
        return hints;
    }

    private static String escJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** Structured JSON representation of the data-flow graph. */
    public String toJson() {
        var sb = new StringBuilder();
        sb.append("{\n  \"types\": [");
        var types = allTypes();
        boolean first = true;
        for (var t : types) {
            if (!first) sb.append(",");
            sb.append("\n    {\"name\": \"").append(escJson(t.getSimpleName())).append("\"");
            var prods = producersOf(t);
            if (!prods.isEmpty()) {
                sb.append(", \"producers\": [");
                for (int i = 0; i < prods.size(); i++) {
                    if (i > 0) sb.append(", ");
                    sb.append("\"").append(escJson(prods.get(i).name())).append("\"");
                }
                sb.append("]");
            }
            var cons = consumersOf(t);
            if (!cons.isEmpty()) {
                sb.append(", \"consumers\": [");
                for (int i = 0; i < cons.size(); i++) {
                    if (i > 0) sb.append(", ");
                    sb.append("\"").append(escJson(cons.get(i).name())).append("\"");
                }
                sb.append("]");
            }
            sb.append("}");
            first = false;
        }
        sb.append("\n  ],\n  \"deadData\": [");
        first = true;
        for (var d : deadData()) {
            if (!first) sb.append(", ");
            sb.append("\"").append(d.getSimpleName()).append("\"");
            first = false;
        }
        sb.append("]\n}");
        return sb.toString();
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

    // ─── Migration support ────────────────────────────────────

    /**
     * Recommended migration order: processors sorted by dependency count (fewest first).
     * Processors with no requires come first, then those whose requires are all
     * produced by earlier processors.
     */
    public List<String> migrationOrder() {
        // Collect all unique processor/guard names with their requires/produces
        var nodeReqs = new LinkedHashMap<String, Set<Class<?>>>();
        var nodeProds = new LinkedHashMap<String, Set<Class<?>>>();
        for (var entry : consumers.entrySet()) {
            for (var n : entry.getValue()) {
                nodeReqs.computeIfAbsent(n.name(), k -> new LinkedHashSet<>()).add(entry.getKey());
            }
        }
        for (var entry : producers.entrySet()) {
            for (var n : entry.getValue()) {
                nodeProds.computeIfAbsent(n.name(), k -> new LinkedHashSet<>()).add(entry.getKey());
            }
        }

        var order = new ArrayList<String>();
        var available = new HashSet<>(allProduced.stream()
                .filter(t -> producers.getOrDefault(t, List.of()).stream().anyMatch(n -> "initial".equals(n.name())))
                .toList());
        var remaining = new LinkedHashSet<>(nodeReqs.keySet());
        remaining.addAll(nodeProds.keySet());
        remaining.remove("initial");

        while (!remaining.isEmpty()) {
            String next = null;
            for (String name : remaining) {
                var reqs = nodeReqs.getOrDefault(name, Set.of());
                if (available.containsAll(reqs)) { next = name; break; }
            }
            if (next == null) { order.addAll(remaining); break; } // circular or unresolvable
            order.add(next);
            remaining.remove(next);
            available.addAll(nodeProds.getOrDefault(next, Set.of()));
        }
        return order;
    }

    /**
     * Generate a Markdown migration checklist.
     */
    public String toMarkdown() {
        var sb = new StringBuilder();
        sb.append("# Migration Checklist\n\n");
        var order = migrationOrder();
        for (int i = 0; i < order.size(); i++) {
            String name = order.get(i);
            var reqs = consumers.entrySet().stream()
                    .filter(e -> e.getValue().stream().anyMatch(n -> n.name().equals(name)))
                    .map(e -> e.getKey().getSimpleName()).sorted().toList();
            var prods = producers.entrySet().stream()
                    .filter(e -> e.getValue().stream().anyMatch(n -> n.name().equals(name)))
                    .map(e -> e.getKey().getSimpleName()).sorted().toList();
            sb.append("- [ ] **").append(i + 1).append(". ").append(name).append("**");
            if (!reqs.isEmpty()) sb.append("  requires: ").append(reqs);
            if (!prods.isEmpty()) sb.append("  produces: ").append(prods);
            sb.append('\n');
        }
        var dead = deadData();
        if (!dead.isEmpty()) {
            sb.append("\n## Dead Data (produced but never consumed)\n\n");
            for (var d : dead) sb.append("- ").append(d.getSimpleName()).append('\n');
        }
        return sb.toString();
    }

    // ─── Test generation ──────────────────────────────────────

    /**
     * Test scaffold: for each processor/guard, list the types needed in context (requires).
     * Returns a map of processor name → required type names.
     */
    public Map<String, List<String>> testScaffold() {
        var scaffold = new LinkedHashMap<String, List<String>>();
        for (var entry : consumers.entrySet()) {
            for (var node : entry.getValue()) {
                scaffold.computeIfAbsent(node.name(), k -> new ArrayList<>())
                        .add(entry.getKey().getSimpleName());
            }
        }
        return scaffold;
    }

    /**
     * Generate data-flow invariant assertions as strings.
     * Each assertion: "At state X: context must contain [A, B, C]"
     */
    public List<String> generateInvariantAssertions() {
        var assertions = new ArrayList<String>();
        for (var entry : availableAtState.entrySet()) {
            var types = entry.getValue().stream()
                    .map(Class::getSimpleName)
                    .sorted()
                    .toList();
            assertions.add("At state " + entry.getKey().name() + ": context must contain " + types);
        }
        return assertions;
    }

    // ─── Cross-flow / Versioning utilities ─────────────────────

    /**
     * Cross-flow data-flow map: find types that flow A produces and flow B requires (or vice versa).
     * Returns pairs of (type, producerFlow, consumerFlow).
     */
    public static List<String> crossFlowMap(DataFlowGraph<?>... graphs) {
        var results = new ArrayList<String>();
        for (int i = 0; i < graphs.length; i++) {
            for (int j = 0; j < graphs.length; j++) {
                if (i == j) continue;
                for (Class<?> produced : graphs[i].allProduced) {
                    if (graphs[j].allConsumed.contains(produced)) {
                        results.add(produced.getSimpleName() + ": flow " + i + " produces → flow " + j + " consumes");
                    }
                }
            }
        }
        return results;
    }

    /**
     * Diff two data-flow graphs. Returns added/removed types and producers/consumers.
     */
    public record DiffResult(Set<String> addedTypes, Set<String> removedTypes,
                             Set<String> addedEdges, Set<String> removedEdges) {}

    public static DiffResult diff(DataFlowGraph<?> before, DataFlowGraph<?> after) {
        Set<String> beforeTypes = new LinkedHashSet<>(), afterTypes = new LinkedHashSet<>();
        for (var t : before.allTypes()) beforeTypes.add(t.getSimpleName());
        for (var t : after.allTypes()) afterTypes.add(t.getSimpleName());

        Set<String> addedTypes = new LinkedHashSet<>(afterTypes); addedTypes.removeAll(beforeTypes);
        Set<String> removedTypes = new LinkedHashSet<>(beforeTypes); removedTypes.removeAll(afterTypes);

        Set<String> beforeEdges = collectEdges(before), afterEdges = collectEdges(after);
        Set<String> addedEdges = new LinkedHashSet<>(afterEdges); addedEdges.removeAll(beforeEdges);
        Set<String> removedEdges = new LinkedHashSet<>(beforeEdges); removedEdges.removeAll(afterEdges);

        return new DiffResult(addedTypes, removedTypes, addedEdges, removedEdges);
    }

    private static Set<String> collectEdges(DataFlowGraph<?> graph) {
        var edges = new LinkedHashSet<String>();
        for (var entry : graph.producers.entrySet()) {
            for (var n : entry.getValue()) edges.add(n.name() + " --produces--> " + entry.getKey().getSimpleName());
        }
        for (var entry : graph.consumers.entrySet()) {
            for (var n : entry.getValue()) edges.add(entry.getKey().getSimpleName() + " --requires--> " + n.name());
        }
        return edges;
    }

    /**
     * Version compatibility: check if instances running on defBefore can resume on defAfter.
     * Returns list of incompatibilities per state.
     */
    public static <S extends Enum<S> & FlowState> List<String> versionCompatibility(
            DataFlowGraph<S> before, DataFlowGraph<S> after) {
        var issues = new ArrayList<String>();
        for (var entry : before.availableAtState.entrySet()) {
            S state = entry.getKey();
            Set<Class<?>> beforeAvail = entry.getValue();
            Set<Class<?>> afterAvail = after.availableAtState.getOrDefault(state, Set.of());
            // Check: does after require more types than before has?
            for (Class<?> type : afterAvail) {
                if (!beforeAvail.contains(type)) {
                    issues.add("State " + state.name() + ": v2 expects " + type.getSimpleName() + " but v1 instances may not have it");
                }
            }
        }
        return issues;
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
