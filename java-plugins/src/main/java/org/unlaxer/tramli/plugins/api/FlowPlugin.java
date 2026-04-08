package org.unlaxer.tramli.plugins.api;

public interface FlowPlugin {
    PluginDescriptor descriptor();
    PluginKind kind();

    default String id() {
        return descriptor().id();
    }
}
