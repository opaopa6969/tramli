package com.tramli;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Generates Mermaid stateDiagram-v2 from FlowDefinition.
 */
public final class MermaidGenerator {

    private MermaidGenerator() {}

    public static <S extends Enum<S> & FlowState> String generate(FlowDefinition<S> definition) {
        var sb = new StringBuilder();
        sb.append("stateDiagram-v2\n");

        S initial = definition.initialState();
        if (initial != null) sb.append("    [*] --> ").append(initial.name()).append('\n');

        Set<String> seen = new LinkedHashSet<>();
        for (Transition<S> t : definition.transitions()) {
            String key = t.from().name() + "->" + t.to().name();
            if (!seen.add(key)) continue;
            String label = transitionLabel(t);
            sb.append("    ").append(t.from().name()).append(" --> ").append(t.to().name());
            if (!label.isEmpty()) sb.append(" : ").append(label);
            sb.append('\n');
        }

        Set<String> errorSeen = new LinkedHashSet<>();
        for (var entry : definition.errorTransitions().entrySet()) {
            String key = entry.getKey().name() + "->" + entry.getValue().name();
            if (seen.contains(key)) continue;
            if (!errorSeen.add(key)) continue;
            sb.append("    ").append(entry.getKey().name())
              .append(" --> ").append(entry.getValue().name()).append(" : error\n");
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
        };
    }

    /** Generate Mermaid data-flow diagram from requires/produces declarations. */
    public static <S extends Enum<S> & FlowState> String generateDataFlow(FlowDefinition<S> definition) {
        return definition.dataFlowGraph().toMermaid();
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
