package org.unlaxer.tramli.plugins.docs;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.Transition;

public final class DocumentationPlugin {
    public <S extends Enum<S> & FlowState> String toMarkdown(FlowDefinition<S> definition) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Flow Catalog: ").append(definition.name()).append("\n\n");
        sb.append("## States\n\n");
        for (S state : definition.allStates()) {
            sb.append("- `").append(state.name()).append("`");
            if (state.isInitial()) sb.append(" (initial)");
            if (state.isTerminal()) sb.append(" (terminal)");
            sb.append('\n');
        }
        sb.append("\n## Transitions\n\n");
        for (Transition<S> t : definition.transitions()) {
            sb.append("- `").append(t.from()).append(" -> ").append(t.to()).append("` via `");
            if (t.processor() != null) sb.append(t.processor().name());
            else if (t.guard() != null) sb.append(t.guard().name());
            else if (t.branch() != null) sb.append(t.branch().name());
            else sb.append(t.type());
            sb.append("`\n");
        }
        return sb.toString();
    }
}
