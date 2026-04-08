package org.unlaxer.tramli.plugins.api;

import org.unlaxer.tramli.FlowEngine;

/**
 * Binds a typed runtime facade on top of a configured {@link FlowEngine}.
 *
 * <p>This plugin kind is intentionally separate from {@link EnginePlugin}:
 * engine plugins mutate or install behavior into an engine instance, while
 * runtime adapter plugins expose an additional API surface layered on top of
 * the engine (for example rich resume APIs, idempotent wrappers, etc.).</p>
 */
public interface RuntimeAdapterPlugin<R> extends FlowPlugin {
    R bind(FlowEngine engine);

    @Override
    default PluginKind kind() {
        return PluginKind.RUNTIME_ADAPTER;
    }
}
