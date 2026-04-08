package org.unlaxer.tramli.plugins.eventstore;

import org.unlaxer.tramli.FlowStore;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;
import org.unlaxer.tramli.plugins.api.StorePlugin;

public final class EventLogStorePlugin implements StorePlugin {
    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("event-log", "Event Log Store", "Wraps FlowStore with append-only transition and compensation logging.");
    }

    @Override
    public FlowStore wrapStore(FlowStore store) {
        return new EventLogStoreDecorator(store);
    }
}
