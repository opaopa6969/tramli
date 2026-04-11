import type { StateConfig } from './types.js';
import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
export declare class Tramli {
    static define<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S>;
    static engine(store: InMemoryFlowStore): FlowEngine;
}
