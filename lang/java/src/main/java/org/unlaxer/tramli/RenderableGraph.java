package org.unlaxer.tramli;

import java.util.*;

/**
 * Read-only views of flow graphs for pluggable rendering.
 * Use with {@code graph.renderDataFlow(renderer)} or
 * {@code definition.renderStateDiagram(renderer)}.
 */
public final class RenderableGraph {
    private RenderableGraph() {}

    public enum EdgeKind { REQUIRES, PRODUCES }

    public record Edge(String from, String to, EdgeKind kind) {}

    /** Data-flow graph view: type nodes ↔ processor nodes. */
    public record DataFlow(
            String flowName,
            List<Edge> edges,
            Set<String> typeNodes,
            Set<String> processorNodes,
            Set<String> deadDataNodes
    ) {}

    public record StateEdge(String from, String to, String label) {}

    /** State diagram view: state transitions + sub-flows. */
    public record StateDiagram(
            String flowName,
            String initialState,
            List<StateEdge> transitions,
            Set<String> terminalStates,
            List<SubFlowBlock> subFlows
    ) {}

    public record SubFlowBlock(String parentState, StateDiagram inner) {}
}
