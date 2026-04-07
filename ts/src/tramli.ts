import type { StateConfig } from './types.js';
import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';

export class Tramli {
  static define<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S> {
    return new Builder(name, stateConfig);
  }

  static engine(store: InMemoryFlowStore): FlowEngine {
    return new FlowEngine(store);
  }
}
