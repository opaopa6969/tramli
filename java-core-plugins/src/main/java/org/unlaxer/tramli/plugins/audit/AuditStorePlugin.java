package org.unlaxer.tramli.plugins.audit;

import org.unlaxer.tramli.FlowStore;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;
import org.unlaxer.tramli.plugins.api.StorePlugin;

public final class AuditStorePlugin implements StorePlugin {
    private final ProducedDataSerializer serializer;

    public AuditStorePlugin() {
        this(new DefaultProducedDataSerializer());
    }

    public AuditStorePlugin(ProducedDataSerializer serializer) {
        this.serializer = serializer;
    }

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("audit-store", "Audit Store", "Captures produced-data diffs per transition.");
    }

    @Override
    public FlowStore wrapStore(FlowStore store) {
        return new AuditingFlowStore(store, serializer);
    }
}
