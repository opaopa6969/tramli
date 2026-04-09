package org.unlaxer.tramli.plugins.api;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.FlowStore;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class PluginRegistry {
    private final List<FlowPlugin> plugins = new ArrayList<>();

    public PluginRegistry register(FlowPlugin plugin) {
        plugins.add(plugin);
        return this;
    }

    public List<FlowPlugin> plugins() {
        return Collections.unmodifiableList(plugins);
    }

    public <S extends Enum<S> & FlowState> PluginReport analyzeAll(FlowDefinition<S> definition) {
        PluginReport report = new PluginReport();
        for (FlowPlugin plugin : plugins) {
            if (plugin instanceof AnalysisPlugin<?> raw) {
                @SuppressWarnings("unchecked")
                AnalysisPlugin<S> typed = (AnalysisPlugin<S>) raw;
                typed.analyze(definition, report);
            }
        }
        return report;
    }

    public FlowStore applyStorePlugins(FlowStore baseStore) {
        FlowStore current = baseStore;
        for (FlowPlugin plugin : plugins) {
            if (plugin instanceof StorePlugin storePlugin) {
                current = storePlugin.wrapStore(current);
            }
        }
        return current;
    }

    public void installEnginePlugins(FlowEngine engine) {
        for (FlowPlugin plugin : plugins) {
            if (plugin instanceof EnginePlugin enginePlugin) {
                enginePlugin.install(engine);
            }
        }
    }

    public <R> List<R> bindRuntimeAdapters(FlowEngine engine, Class<R> adapterType) {
        List<R> adapters = new ArrayList<>();
        for (FlowPlugin plugin : plugins) {
            if (plugin instanceof RuntimeAdapterPlugin<?> rawAdapter) {
                Object bound = rawAdapter.bind(engine);
                if (adapterType.isInstance(bound)) {
                    adapters.add(adapterType.cast(bound));
                }
            }
        }
        return adapters;
    }
}
