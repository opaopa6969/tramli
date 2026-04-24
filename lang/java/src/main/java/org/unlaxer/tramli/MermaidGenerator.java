package org.unlaxer.tramli;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Generates Mermaid stateDiagram-v2 from FlowDefinition.
 */
public final class MermaidGenerator {

    /**
     * Which diagram to generate.
     *
     * <ul>
     *   <li>{@link #STATE}: state transitions (stateDiagram-v2)</li>
     *   <li>{@link #DATAFLOW}: data-flow graph (nodes = processors/guards, edges = FlowKey types)</li>
     * </ul>
     *
     * Corresponds to Issue #47. See also DD-042 Implication.
     */
    public enum View { STATE, DATAFLOW }

    private MermaidGenerator() {}

    public static <S extends Enum<S> & FlowState> String generate(FlowDefinition<S> definition) {
        return generate(definition, false);
    }

    /**
     * Generate Mermaid diagram with view selection.
     * <p>Equivalent to {@link #generateDataFlow(FlowDefinition)} when view is DATAFLOW.
     */
    public static <S extends Enum<S> & FlowState> String generate(FlowDefinition<S> definition, View view) {
        return switch (view) {
            case DATAFLOW -> generateDataFlow(definition);
            case STATE -> generate(definition, false);
        };
    }

    public static <S extends Enum<S> & FlowState> String generate(FlowDefinition<S> definition, boolean excludeErrorTransitions) {
        var sb = new StringBuilder();
        sb.append("stateDiagram-v2\n");

        S initial = definition.initialState();
        if (initial != null) sb.append("    [*] --> ").append(initial.name()).append('\n');

        Set<String> seen = new LinkedHashSet<>();
        for (Transition<S> t : definition.transitions()) {
            if (t.isSubFlow() && t.subFlowDefinition() != null) {
                // Render sub-flow as Mermaid subgraph
                var subDef = t.subFlowDefinition();
                sb.append("    state ").append(t.from().name()).append(" {\n");
                if (subDef.initialState() != null)
                    sb.append("        [*] --> ").append(subDef.initialState().name()).append('\n');
                for (var st : subDef.transitions()) {
                    String sKey = st.from().name() + "->" + st.to().name();
                    sb.append("        ").append(st.from().name()).append(" --> ").append(st.to().name());
                    String sLabel = transitionLabel(st);
                    if (!sLabel.isEmpty()) sb.append(" : ").append(sLabel);
                    sb.append('\n');
                }
                for (var term : subDef.terminalStates())
                    sb.append("        ").append(term.name()).append(" --> [*]\n");
                sb.append("    }\n");
                // Add exit transitions
                for (var exit : t.exitMappings().entrySet())
                    sb.append("    ").append(t.from().name()).append(" --> ").append(exit.getValue().name())
                      .append(" : ").append(exit.getKey()).append('\n');
                continue;
            }
            String key = t.from().name() + "->" + t.to().name();
            if (!seen.add(key)) continue;
            String label = transitionLabel(t);
            sb.append("    ").append(t.from().name()).append(" --> ").append(t.to().name());
            if (!label.isEmpty()) sb.append(" : ").append(label);
            sb.append('\n');
        }

        if (!excludeErrorTransitions) {
            Set<String> errorSeen = new LinkedHashSet<>();
            for (var entry : definition.errorTransitions().entrySet()) {
                String key = entry.getKey().name() + "->" + entry.getValue().name();
                if (seen.contains(key)) continue;
                if (!errorSeen.add(key)) continue;
                sb.append("    ").append(entry.getKey().name())
                  .append(" --> ").append(entry.getValue().name()).append(" : error\n");
            }
        }

        for (S s : definition.terminalStates()) {
            sb.append("    ").append(s.name()).append(" --> [*]\n");
        }
        return sb.toString();
    }

    private static <S extends Enum<S> & FlowState> String transitionLabel(Transition<S> t) {
        return switch (t.type()) {
            case AUTO -> t.processor() != null ? t.processor().name() : "";
            case EXTERNAL -> t.guard() != null ? "[" + t.guard().name() + "]" : "";
            case BRANCH -> t.branch() != null ? t.branch().name() : "";
            case SUB_FLOW -> t.subFlowDefinition() != null ? "{" + t.subFlowDefinition().name() + "}" : "";
        };
    }

    /**
     * Generate Mermaid diagram highlighting external transitions and their data contracts.
     * Shows what data clients must send and what they receive.
     */
    public static <S extends Enum<S> & FlowState> String generateExternalContract(FlowDefinition<S> definition) {
        var sb = new StringBuilder();
        sb.append("flowchart LR\n");
        for (Transition<S> t : definition.transitions()) {
            if (!t.isExternal()) continue;
            sb.append("    subgraph ").append(t.from().name()).append("_to_").append(t.to().name()).append("\n");
            sb.append("        direction TB\n");
            if (t.guard() != null) {
                sb.append("        ").append(t.guard().name()).append("{\"[").append(t.guard().name()).append("]\"}\n");
                for (var req : t.guard().requires())
                    sb.append("        ").append(req.getSimpleName()).append(" -->|client sends| ").append(t.guard().name()).append("\n");
                for (var prod : t.guard().produces())
                    sb.append("        ").append(t.guard().name()).append(" -->|returns| ").append(prod.getSimpleName()).append("\n");
            }
            sb.append("    end\n");
        }
        return sb.toString();
    }

    /** Generate Mermaid data-flow diagram from requires/produces declarations. */
    public static <S extends Enum<S> & FlowState> String generateDataFlow(FlowDefinition<S> definition) {
        return definition.dataFlowGraph().toMermaid();
    }

    /**
     * Render a RenderableGraph.DataFlow as Mermaid flowchart.
     * Can be used as a method reference: {@code graph.renderDataFlow(MermaidGenerator::dataFlow)}
     */
    public static String dataFlow(RenderableGraph.DataFlow graph) {
        var sb = new StringBuilder("flowchart LR\n");
        var seen = new LinkedHashSet<String>();
        for (var edge : graph.edges()) {
            String line = edge.from() + " -->|" + edge.kind().name().toLowerCase() + "| " + edge.to();
            if (seen.add(line)) sb.append("    ").append(line).append('\n');
        }
        return sb.toString();
    }

    /**
     * Render a RenderableGraph.StateDiagram as Mermaid stateDiagram-v2.
     * Can be used as a method reference: {@code def.renderStateDiagram(MermaidGenerator::stateDiagram)}
     */
    public static String stateDiagram(RenderableGraph.StateDiagram diagram) {
        var sb = new StringBuilder("stateDiagram-v2\n");
        if (diagram.initialState() != null)
            sb.append("    [*] --> ").append(diagram.initialState()).append('\n');
        for (var t : diagram.transitions()) {
            sb.append("    ").append(t.from()).append(" --> ").append(t.to());
            if (t.label() != null && !t.label().isEmpty()) sb.append(" : ").append(t.label());
            sb.append('\n');
        }
        for (var sub : diagram.subFlows()) {
            sb.append("    state ").append(sub.parentState()).append(" {\n");
            // Recursive: render inner diagram indented
            String inner = stateDiagram(sub.inner());
            for (String line : inner.split("\n")) {
                if (!line.startsWith("stateDiagram")) sb.append("    ").append(line).append('\n');
            }
            sb.append("    }\n");
        }
        for (var t : diagram.terminalStates())
            sb.append("    ").append(t).append(" --> [*]\n");
        return sb.toString();
    }

    public static <S extends Enum<S> & FlowState> String writeToFile(
            FlowDefinition<S> definition, Path outputDir) throws IOException {
        Files.createDirectories(outputDir);
        String content = generate(definition);
        Files.writeString(outputDir.resolve("flow-" + definition.name() + ".mmd"), content);
        String dataFlow = generateDataFlow(definition);
        Files.writeString(outputDir.resolve("dataflow-" + definition.name() + ".mmd"), dataFlow);
        return content;
    }
}
