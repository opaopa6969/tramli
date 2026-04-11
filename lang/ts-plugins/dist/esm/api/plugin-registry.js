import { PluginReport } from './types.js';
/**
 * Central registry for tramli plugins.
 * Manages plugin lifecycle: analyze → wrap store → install engine → bind adapters.
 */
export class PluginRegistry {
    plugins = [];
    register(plugin) {
        this.plugins.push(plugin);
        return this;
    }
    /** Run all analysis plugins against a FlowDefinition. */
    analyzeAll(definition) {
        const report = new PluginReport();
        for (const p of this.plugins) {
            if (p.kind() === 'ANALYSIS') {
                p.analyze(definition, report);
            }
        }
        return report;
    }
    /** Build a FlowDefinition and run all analysis plugins. Throws if any ERROR findings. */
    buildAndAnalyze(builder) {
        const def = builder.build();
        const report = this.analyzeAll(def);
        const errors = report.findings().filter(f => f.severity === 'ERROR');
        if (errors.length > 0) {
            throw new Error(`Analysis errors:\n${errors.map(e => `  [${e.pluginId}] ${e.message}`).join('\n')}`);
        }
        return def;
    }
    /** Run all analysis plugins and throw if any ERROR findings. For already-built definitions. */
    analyzeAndValidate(definition) {
        const report = this.analyzeAll(definition);
        const errors = report.findings().filter(f => f.severity === 'ERROR');
        if (errors.length > 0) {
            throw new Error(`Analysis errors:\n${errors.map(e => `  [${e.pluginId}] ${e.message}`).join('\n')}`);
        }
    }
    /** Apply all store plugins (wrapping in registration order). */
    applyStorePlugins(store) {
        let wrapped = store;
        for (const p of this.plugins) {
            if (p.kind() === 'STORE') {
                wrapped = p.wrapStore(wrapped);
            }
        }
        return wrapped;
    }
    /** Install all engine plugins. */
    installEnginePlugins(engine) {
        for (const p of this.plugins) {
            if (p.kind() === 'ENGINE') {
                p.install(engine);
            }
        }
    }
    /** Bind all runtime adapter plugins. Returns map of plugin id → bound adapter. */
    bindRuntimeAdapters(engine) {
        const adapters = new Map();
        for (const p of this.plugins) {
            if (p.kind() === 'RUNTIME_ADAPTER') {
                const adapter = p.bind(engine);
                adapters.set(p.descriptor().id, adapter);
            }
        }
        return adapters;
    }
}
