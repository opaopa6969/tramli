package org.unlaxer.tramli.plugins.docs;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;

public final class FlowDocumentationPlugin<S extends Enum<S> & FlowState> implements org.unlaxer.tramli.plugins.api.DocumentationPlugin<FlowDefinition<S>> {
    private final DocumentationPlugin delegate = new DocumentationPlugin();

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("docs", "Documentation Generator", "Renders a markdown flow catalog from a flow definition.");
    }

    @Override
    public String generate(FlowDefinition<S> input) {
        return delegate.toMarkdown(input);
    }
}
