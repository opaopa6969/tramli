package org.unlaxer.tramli.plugins.api;

import org.unlaxer.tramli.FlowStore;

public interface StorePlugin extends FlowPlugin {
    FlowStore wrapStore(FlowStore store);

    @Override
    default PluginKind kind() {
        return PluginKind.STORE;
    }
}
