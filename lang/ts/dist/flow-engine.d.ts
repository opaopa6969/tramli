import type { FlowDefinition } from './flow-definition.js';
import { FlowInstance } from './flow-instance.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
export declare class FlowEngine {
    private readonly store;
    constructor(store: InMemoryFlowStore);
    startFlow<S extends string>(definition: FlowDefinition<S>, sessionId: string, initialData: Map<string, unknown>): Promise<FlowInstance<S>>;
    resumeAndExecute<S extends string>(flowId: string, definition: FlowDefinition<S>, externalData?: Map<string, unknown>): Promise<FlowInstance<S>>;
    private executeAutoChain;
    private executeSubFlow;
    private resumeSubFlow;
    private handleError;
}
