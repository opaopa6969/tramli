import type { FlowContext } from '@unlaxer/tramli';
import type { VersionedTransitionEvent } from './types.js';
/**
 * FlowStore decorator that maintains an append-only event log.
 * Tenure-lite: not full event sourcing, intentionally lighter.
 */
export declare class EventLogStoreDecorator {
    private readonly delegate;
    private eventLog;
    private versionCounters;
    constructor(delegate: any);
    create(flow: any): void;
    loadForUpdate<S extends string>(flowId: string, definition?: any): any;
    save(flow: any): void;
    recordTransition(flowId: string, from: any, to: string, trigger: string, ctx: FlowContext): void;
    /** All events across all flows. */
    events(): readonly VersionedTransitionEvent[];
    /** Events for a specific flow. */
    eventsForFlow(flowId: string): VersionedTransitionEvent[];
    /** Append a compensation event. */
    appendCompensation(flowId: string, trigger: string, metadata: string): void;
    get transitionLog(): any;
    clear(): void;
}
