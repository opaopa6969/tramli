import type { FlowContext } from '@unlaxer/tramli';
export interface AuditedTransitionRecord {
    flowId: string;
    from: string | null;
    to: string;
    trigger: string;
    timestamp: Date;
    producedDataSnapshot: Map<string, unknown>;
}
/**
 * FlowStore decorator that captures produced-data snapshots on each transition.
 */
export declare class AuditingFlowStore {
    private readonly delegate;
    private auditLog;
    constructor(delegate: any);
    create(flow: any): void;
    loadForUpdate<S extends string>(flowId: string, definition?: any): any;
    save(flow: any): void;
    recordTransition(flowId: string, from: any, to: string, trigger: string, ctx: FlowContext): void;
    get auditedTransitions(): readonly AuditedTransitionRecord[];
    get transitionLog(): any;
    clear(): void;
}
