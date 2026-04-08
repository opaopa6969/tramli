package org.unlaxer.tramli.plugins.testing;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.api.GenerationPlugin;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;

public final class ScenarioGenerationPlugin<S extends Enum<S> & FlowState> implements GenerationPlugin<FlowDefinition<S>, FlowTestPlan> {
    private final ScenarioTestPlugin delegate = new ScenarioTestPlugin();

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("scenario-tests", "Scenario Test Generator", "Produces scenario-oriented test plans from a flow definition.");
    }

    @Override
    public FlowTestPlan generate(FlowDefinition<S> input) {
        return delegate.generate(input);
    }
}
