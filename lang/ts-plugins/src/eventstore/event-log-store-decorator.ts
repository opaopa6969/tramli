import type { FlowContext } from '@unlaxer/tramli';
import type { VersionedTransitionEvent } from './types.js';

/**
 * FlowStore decorator that maintains an append-only event log.
 * Tenure-lite: not full event sourcing, intentionally lighter.
 */
export class EventLogStoreDecorator {
  private eventLog: VersionedTransitionEvent[] = [];
  private versionCounters = new Map<string, number>();

  constructor(private readonly delegate: any) {}

  create(flow: any): void { this.delegate.create(flow); }

  loadForUpdate<S extends string>(flowId: string, definition?: any): any {
    return this.delegate.loadForUpdate(flowId, definition);
  }

  save(flow: any): void { this.delegate.save(flow); }

  recordTransition(flowId: string, from: any, to: string, trigger: string, ctx: FlowContext): void {
    this.delegate.recordTransition(flowId, from, to, trigger, ctx);
    const version = (this.versionCounters.get(flowId) ?? 0) + 1;
    this.versionCounters.set(flowId, version);
    this.eventLog.push({
      flowId, version, type: 'TRANSITION',
      from: from?.toString() ?? null, to, trigger,
      timestamp: new Date(),
      stateSnapshot: JSON.stringify(Object.fromEntries(ctx.snapshot())),
    });
  }

  /** All events across all flows. */
  events(): readonly VersionedTransitionEvent[] { return this.eventLog; }

  /** Events for a specific flow. */
  eventsForFlow(flowId: string): VersionedTransitionEvent[] {
    return this.eventLog.filter(e => e.flowId === flowId);
  }

  /** Append a compensation event. */
  appendCompensation(flowId: string, trigger: string, metadata: string): void {
    const version = (this.versionCounters.get(flowId) ?? 0) + 1;
    this.versionCounters.set(flowId, version);
    this.eventLog.push({
      flowId, version, type: 'COMPENSATION',
      from: null, to: 'COMPENSATED', trigger,
      timestamp: new Date(), stateSnapshot: metadata,
    });
  }

  get transitionLog() { return this.delegate.transitionLog; }
  clear(): void { this.delegate.clear?.(); this.eventLog = []; this.versionCounters.clear(); }
}
