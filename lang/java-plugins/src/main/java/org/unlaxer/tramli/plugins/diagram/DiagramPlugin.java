package org.unlaxer.tramli.plugins.diagram;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.MermaidGenerator;

public final class DiagramPlugin {
    public <S extends Enum<S> & FlowState> DiagramBundle generate(FlowDefinition<S> definition) {
        String mermaid = MermaidGenerator.generate(definition);
        String json = definition.dataFlowGraph().toJson();
        String md = "# " + definition.name() + "\n\n"
                + "- initial: `" + definition.initialState() + "`\n"
                + "- states: `" + definition.allStates().size() + "`\n"
                + "- transitions: `" + definition.transitions().size() + "`\n";
        return new DiagramBundle(mermaid, json, md);
    }
}
