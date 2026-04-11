package org.unlaxer.tramli.plugins.api;

import org.unlaxer.tramli.FlowEngine;

public interface EnginePlugin extends FlowPlugin {
    void install(FlowEngine engine);

    @Override
    default PluginKind kind() {
        return PluginKind.ENGINE;
    }
}
