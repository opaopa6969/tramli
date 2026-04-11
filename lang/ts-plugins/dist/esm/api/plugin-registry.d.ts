import type { FlowDefinition, FlowEngine, Builder } from '@unlaxer/tramli';
import type { FlowPlugin } from './types.js';
import { PluginReport } from './types.js';
/**
 * Central registry for tramli plugins.
 * Manages plugin lifecycle: analyze → wrap store → install engine → bind adapters.
 */
export declare class PluginRegistry<S extends string> {
    private plugins;
    register(plugin: FlowPlugin): this;
    /** Run all analysis plugins against a FlowDefinition. */
    analyzeAll(definition: FlowDefinition<S>): PluginReport;
    /** Build a FlowDefinition and run all analysis plugins. Throws if any ERROR findings. */
    buildAndAnalyze(builder: Builder<S>): FlowDefinition<S>;
    /** Run all analysis plugins and throw if any ERROR findings. For already-built definitions. */
    analyzeAndValidate(definition: FlowDefinition<S>): void;
    /** Apply all store plugins (wrapping in registration order). */
    applyStorePlugins(store: any): any;
    /** Install all engine plugins. */
    installEnginePlugins(engine: FlowEngine): void;
    /** Bind all runtime adapter plugins. Returns map of plugin id → bound adapter. */
    bindRuntimeAdapters(engine: FlowEngine): Map<string, unknown>;
}
