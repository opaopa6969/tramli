import type { StateConfig } from './types.js';
import type { FlowKey } from './flow-key.js';
import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
import { PipelineBuilder } from './pipeline.js';
export declare class Tramli {
    static define<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S>;
    static engine(store: InMemoryFlowStore, options?: {
        strictMode?: boolean;
    }): FlowEngine;
    /** Create a Map<string, unknown> from flowKey-value pairs. */
    static data(...pairs: [FlowKey<unknown>, unknown][]): Map<string, unknown>;
    static pipeline(name: string): PipelineBuilder;
}
