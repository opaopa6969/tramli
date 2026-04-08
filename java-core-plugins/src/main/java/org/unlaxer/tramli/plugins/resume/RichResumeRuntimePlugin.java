package org.unlaxer.tramli.plugins.resume;

import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;
import org.unlaxer.tramli.plugins.api.RuntimeAdapterPlugin;

public final class RichResumeRuntimePlugin implements RuntimeAdapterPlugin<RichResumeExecutor> {
    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("rich-resume", "Rich Resume", "Binds a FlowEngine to rich resume result helpers.");
    }

    @Override
    public RichResumeExecutor bind(FlowEngine engine) {
        return new RichResumeExecutor(engine);
    }
}
