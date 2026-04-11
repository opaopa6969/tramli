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

    /** Build a FlowDefinition and run all analysis plugins. Throws if any ERROR findings. */
    public <S extends Enum<S> & FlowState> FlowDefinition<S> buildAndAnalyze(FlowDefinition.Builder<S> builder) {
        FlowDefinition<S> def = builder.build();
        PluginReport report = analyzeAll(def);
        var errors = report.findings().stream().filter(f -> "ERROR".equals(f.severity())).toList();
        if (!errors.isEmpty()) {
            var msg = errors.stream().map(e -> "  [" + e.pluginId() + "] " + e.message()).reduce("", (a, b) -> a + "\n" + b);
            throw new IllegalStateException("Analysis errors:" + msg);
        }
        return def;
    }

    /** Run all analysis plugins and throw if any ERROR findings. For already-built definitions. */
    public <S extends Enum<S> & FlowState> void analyzeAndValidate(FlowDefinition<S> definition) {
        PluginReport report = analyzeAll(definition);
        var errors = report.findings().stream().filter(f -> "ERROR".equals(f.severity())).toList();
        if (!errors.isEmpty()) {
            var msg = errors.stream().map(e -> "  [" + e.pluginId() + "] " + e.message()).reduce("", (a, b) -> a + "\n" + b);
            throw new IllegalStateException("Analysis errors:" + msg);
        }
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
