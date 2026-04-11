package org.unlaxer.tramli.plugins.idempotency;

import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;
import org.unlaxer.tramli.plugins.api.RuntimeAdapterPlugin;

public final class IdempotencyRuntimePlugin implements RuntimeAdapterPlugin<IdempotentRichResumeExecutor> {
    private final IdempotencyRegistry registry;

    public IdempotencyRuntimePlugin(IdempotencyRegistry registry) {
        this.registry = registry;
    }

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("idempotency", "Idempotency", "Binds a FlowEngine to duplicate-suppression helpers.");
    }

    @Override
    public IdempotentRichResumeExecutor bind(FlowEngine engine) {
        return new IdempotentRichResumeExecutor(engine, registry);
    }
}
