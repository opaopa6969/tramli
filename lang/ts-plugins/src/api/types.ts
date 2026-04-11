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

/** Describes where in a flow definition a finding is located. */
export type FindingLocation =
  | { type: 'transition'; fromState: string; toState: string }
  | { type: 'state'; state: string }
  | { type: 'data'; dataKey: string }
  | { type: 'flow' };

/** A single analysis finding. */
export interface FindingEntry {
  pluginId: string;
  severity: string;
  message: string;
  location?: FindingLocation;
}

/** Plugin report — collects analysis findings. */
export class PluginReport {
  private entries: FindingEntry[] = [];

  add(pluginId: string, severity: string, message: string): void {
    this.entries.push({ pluginId, severity, message });
  }

  warn(pluginId: string, message: string): void {
    this.add(pluginId, 'WARN', message);
  }

  error(pluginId: string, message: string): void {
    this.add(pluginId, 'ERROR', message);
  }

  warnAt(pluginId: string, message: string, location: FindingLocation): void {
    this.entries.push({ pluginId, severity: 'WARN', message, location });
  }

  errorAt(pluginId: string, message: string, location: FindingLocation): void {
    this.entries.push({ pluginId, severity: 'ERROR', message, location });
  }

  asText(): string {
    if (this.entries.length === 0) return 'No findings.';
    return this.entries.map(e => {
      let text = `[${e.severity}] ${e.pluginId}: ${e.message}`;
      if (e.location) text += ` @ ${formatLocation(e.location)}`;
      return text;
    }).join('\n');
  }

  findings(): FindingEntry[] { return [...this.entries]; }
}

function formatLocation(loc: FindingLocation): string {
  switch (loc.type) {
    case 'transition': return `transition(${loc.fromState} -> ${loc.toState})`;
    case 'state': return `state(${loc.state})`;
    case 'data': return `data(${loc.dataKey})`;
    case 'flow': return 'flow';
  }
}
