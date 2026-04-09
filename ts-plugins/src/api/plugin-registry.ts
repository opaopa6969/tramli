import type { FlowDefinition, FlowEngine, Builder } from '@unlaxer/tramli';
import type {
  FlowPlugin, AnalysisPlugin, StorePlugin, EnginePlugin,
  RuntimeAdapterPlugin, GenerationPlugin
} from './types.js';
import { PluginReport } from './types.js';

/**
 * Central registry for tramli plugins.
 * Manages plugin lifecycle: analyze → wrap store → install engine → bind adapters.
 */
export class PluginRegistry<S extends string> {
  private plugins: FlowPlugin[] = [];

  register(plugin: FlowPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  /** Run all analysis plugins against a FlowDefinition. */
  analyzeAll(definition: FlowDefinition<S>): PluginReport {
    const report = new PluginReport();
    for (const p of this.plugins) {
      if (p.kind() === 'ANALYSIS') {
        (p as AnalysisPlugin<S>).analyze(definition, report);
      }
    }
    return report;
  }

  /** Build a FlowDefinition and run all analysis plugins. Throws if any ERROR findings. */
  buildAndAnalyze(builder: Builder<S>): FlowDefinition<S> {
    const def = builder.build();
    const report = this.analyzeAll(def);
    const errors = report.findings().filter(f => f.severity === 'ERROR');
    if (errors.length > 0) {
      throw new Error(`Analysis errors:\n${errors.map(e => `  [${e.pluginId}] ${e.message}`).join('\n')}`);
    }
    return def;
  }

  /** Apply all store plugins (wrapping in registration order). */
  applyStorePlugins(store: any): any {
    let wrapped = store;
    for (const p of this.plugins) {
      if (p.kind() === 'STORE') {
        wrapped = (p as StorePlugin).wrapStore(wrapped);
      }
    }
    return wrapped;
  }

  /** Install all engine plugins. */
  installEnginePlugins(engine: FlowEngine): void {
    for (const p of this.plugins) {
      if (p.kind() === 'ENGINE') {
        (p as EnginePlugin).install(engine);
      }
    }
  }

  /** Bind all runtime adapter plugins. Returns map of plugin id → bound adapter. */
  bindRuntimeAdapters(engine: FlowEngine): Map<string, unknown> {
    const adapters = new Map<string, unknown>();
    for (const p of this.plugins) {
      if (p.kind() === 'RUNTIME_ADAPTER') {
        const adapter = (p as RuntimeAdapterPlugin<unknown>).bind(engine);
        adapters.set(p.descriptor().id, adapter);
      }
    }
    return adapters;
  }
}
