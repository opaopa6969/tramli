package org.unlaxer.tramli.plugins.diagram;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.api.GenerationPlugin;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;

public final class DiagramGenerationPlugin<S extends Enum<S> & FlowState> implements GenerationPlugin<FlowDefinition<S>, DiagramBundle> {
    private final DiagramPlugin delegate = new DiagramPlugin();

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("diagram", "Diagram Generator", "Generates Mermaid and data-flow bundles from a flow definition.");
    }

    @Override
    public DiagramBundle generate(FlowDefinition<S> input) {
        return delegate.generate(input);
    }
}
