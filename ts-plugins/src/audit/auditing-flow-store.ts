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
export class AuditingFlowStore {
  private auditLog: AuditedTransitionRecord[] = [];

  constructor(private readonly delegate: any) {}

  create(flow: any): void { this.delegate.create(flow); }

  loadForUpdate<S extends string>(flowId: string, definition?: any): any {
    return this.delegate.loadForUpdate(flowId, definition);
  }

  save(flow: any): void { this.delegate.save(flow); }

  recordTransition(flowId: string, from: any, to: string, trigger: string, ctx: FlowContext): void {
    this.delegate.recordTransition(flowId, from, to, trigger, ctx);
    const snapshot = new Map<string, unknown>();
    for (const [k, v] of ctx.snapshot()) {
      snapshot.set(k, v);
    }
    this.auditLog.push({
      flowId, from: from?.toString() ?? null, to, trigger,
      timestamp: new Date(), producedDataSnapshot: snapshot,
    });
  }

  get auditedTransitions(): readonly AuditedTransitionRecord[] { return this.auditLog; }
  get transitionLog() { return this.delegate.transitionLog; }
  clear(): void { this.delegate.clear?.(); this.auditLog = []; }
}
