import type { StateConfig } from './types.js';
import type { FlowKey } from './flow-key.js';
import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
import { PipelineBuilder } from './pipeline.js';

export class Tramli {
  static define<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S> {
    return new Builder(name, stateConfig);
  }

  static engine(store: InMemoryFlowStore, options?: { strictMode?: boolean }): FlowEngine {
    return new FlowEngine(store, options);
  }

  /** Create a Map<string, unknown> from flowKey-value pairs. */
  static data(...pairs: [FlowKey<unknown>, unknown][]): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const [key, value] of pairs) map.set(key as string, value);
    return map;
  }

  static pipeline(name: string): PipelineBuilder {
    return new PipelineBuilder(name);
  }
}
