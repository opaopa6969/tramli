package org.unlaxer.tramli.plugins.api;

public interface GenerationPlugin<I, O> extends FlowPlugin {
    O generate(I input);

    @Override
    default PluginKind kind() {
        return PluginKind.GENERATION;
    }
}
