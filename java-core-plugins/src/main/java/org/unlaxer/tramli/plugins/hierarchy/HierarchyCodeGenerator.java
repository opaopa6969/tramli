package org.unlaxer.tramli.plugins.hierarchy;

import java.util.ArrayList;
import java.util.List;

public final class HierarchyCodeGenerator {
    private record FlatState(String enumName, boolean terminal, boolean initial) {}

    public String generateEnumSource(HierarchicalFlowSpec spec, String packageName) {
        List<FlatState> flatStates = new ArrayList<>();
        flatten(spec.rootStates(), "", flatStates);
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(packageName).append(";\n\n");
        sb.append("import org.unlaxer.tramli.FlowState;\n\n");
        sb.append("public enum ").append(spec.enumName()).append(" implements FlowState {\n");
        for (int i = 0; i < flatStates.size(); i++) {
            FlatState s = flatStates.get(i);
            sb.append("    ").append(s.enumName()).append('(').append(s.terminal()).append(',').append(s.initial()).append(')');
            sb.append(i + 1 < flatStates.size() ? ",\n" : ";\n");
        }
        sb.append("\n    private final boolean terminal;\n");
        sb.append("    private final boolean initial;\n");
        sb.append("    ").append(spec.enumName()).append("(boolean terminal, boolean initial) { this.terminal = terminal; this.initial = initial; }\n");
        sb.append("    @Override public boolean isTerminal() { return terminal; }\n");
        sb.append("    @Override public boolean isInitial() { return initial; }\n");
        sb.append("}\n");
        return sb.toString();
    }

    public String generateBuilderSkeleton(HierarchicalFlowSpec spec, String packageName) {
        String enumName = spec.enumName();
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(packageName).append(";\n\n");
        sb.append("import org.unlaxer.tramli.*;\n");
        sb.append("import java.util.Set;\n\n");
        sb.append("public final class ").append(spec.flowName()).append("Generated {\n");
        sb.append("    private ").append(spec.flowName()).append("Generated() {}\n\n");
        sb.append("    public static FlowDefinition<").append(enumName).append("> build() {\n");
        sb.append("        var b = Tramli.define(\"").append(spec.flowName()).append("\", ").append(enumName).append(".class);\n");
        for (HierarchicalTransitionSpec t : spec.transitions()) {
            sb.append("        // ").append(t.trigger()).append("\n");
            sb.append("        // from ").append(t.from()).append(" to ").append(t.to()).append(" requires ").append(t.requires()).append(" produces ").append(t.produces()).append("\n");
        }
        sb.append("        return b.build();\n");
        sb.append("    }\n");
        sb.append("}\n");
        return sb.toString();
    }

    private void flatten(List<HierarchicalStateSpec> states, String prefix, List<FlatState> out) {
        for (HierarchicalStateSpec state : states) {
            String flat = (prefix.isEmpty() ? state.name() : prefix + '_' + state.name()).toUpperCase();
            out.add(new FlatState(flat, state.terminal(), state.initial()));
            flatten(state.children(), flat, out);
        }
    }
}
