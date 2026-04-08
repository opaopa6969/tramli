package org.unlaxer.tramli.plugins.api;

public interface DocumentationPlugin<I> extends GenerationPlugin<I, String> {
    @Override
    default PluginKind kind() {
        return PluginKind.DOCUMENTATION;
    }
}
