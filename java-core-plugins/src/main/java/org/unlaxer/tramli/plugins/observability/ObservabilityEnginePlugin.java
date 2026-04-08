package org.unlaxer.tramli.plugins.observability;

import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.plugins.api.EnginePlugin;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;

public final class ObservabilityEnginePlugin implements EnginePlugin {
    private final ObservabilityPlugin delegate;

    public ObservabilityEnginePlugin(TelemetrySink sink) {
        this.delegate = new ObservabilityPlugin(sink);
    }

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("observability", "Observability", "Installs telemetry listeners on a FlowEngine.");
    }

    @Override
    public void install(FlowEngine engine) {
        delegate.install(engine);
    }
}
