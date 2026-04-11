import type { FlowContext } from './flow-context.js';
import type { FlowInstance } from './flow-instance.js';
export interface TransitionRecord {
    flowId: string;
    from: string | null;
    to: string;
    trigger: string;
    subFlow: string | null;
    timestamp: Date;
}
export declare class InMemoryFlowStore {
    private flows;
    private _transitionLog;
    /** Clear all flows and transition log. For pool/reuse patterns. */
    clear(): void;
    create(flow: FlowInstance<any>): void;
    loadForUpdate<S extends string>(flowId: string, _definition?: any): FlowInstance<S> | undefined;
    save(flow: FlowInstance<any>): void;
    recordTransition(flowId: string, from: string | null, to: string, trigger: string, _ctx: FlowContext): void;
    get transitionLog(): readonly TransitionRecord[];
}
