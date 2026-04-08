import type { FlowDefinition, FlowEngine, FlowInstance, FlowContext } from '@unlaxer/tramli';

/** Plugin kind classification. */
export type PluginKind = 'ANALYSIS' | 'STORE' | 'ENGINE' | 'RUNTIME_ADAPTER' | 'GENERATION' | 'DOCUMENTATION';

/** Plugin descriptor. */
export interface PluginDescriptor {
  id: string;
  displayName: string;
  description: string;
}

/** Base plugin interface. */
export interface FlowPlugin {
  descriptor(): PluginDescriptor;
  kind(): PluginKind;
  id?(): string;
}

/** Analysis plugin — static analysis of FlowDefinition. */
export interface AnalysisPlugin<S extends string> extends FlowPlugin {
  analyze(definition: FlowDefinition<S>, report: PluginReport): void;
}

/** Store plugin — wraps FlowStore with additional behavior. */
export interface StorePlugin extends FlowPlugin {
  wrapStore(store: any): any; // FlowStore → decorated FlowStore
}

/** Engine plugin — installs hooks on FlowEngine. */
export interface EnginePlugin extends FlowPlugin {
  install(engine: FlowEngine): void;
}

/** Runtime adapter plugin — binds FlowEngine to return richer API. */
export interface RuntimeAdapterPlugin<R> extends FlowPlugin {
  bind(engine: FlowEngine): R;
}

/** Generation plugin — generates output from input. */
export interface GenerationPlugin<I, O> extends FlowPlugin {
  generate(input: I): O;
}

/** Documentation plugin — generates string documentation. */
export interface DocumentationPlugin<I> extends GenerationPlugin<I, string> {}

/** Plugin report — collects analysis findings. */
export class PluginReport {
  private entries: Array<{ pluginId: string; severity: string; message: string }> = [];

  add(pluginId: string, severity: string, message: string): void {
    this.entries.push({ pluginId, severity, message });
  }

  warn(pluginId: string, message: string): void {
    this.add(pluginId, 'WARN', message);
  }

  error(pluginId: string, message: string): void {
    this.add(pluginId, 'ERROR', message);
  }

  asText(): string {
    if (this.entries.length === 0) return 'No findings.';
    return this.entries.map(e => `[${e.severity}] ${e.pluginId}: ${e.message}`).join('\n');
  }

  findings() { return [...this.entries]; }
}
