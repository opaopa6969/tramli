import type { FlowContext } from './flow-context.js';
import type { FlowInstance } from './flow-instance.js';

export interface TransitionRecord {
  flowId: string;
  from: string | null;
  to: string;
  trigger: string;
  timestamp: Date;
}

export class InMemoryFlowStore {
  private flows = new Map<string, FlowInstance<any>>();
  private _transitionLog: TransitionRecord[] = [];

  create(flow: FlowInstance<any>): void {
    this.flows.set(flow.id, flow);
  }

  loadForUpdate<S extends string>(flowId: string): FlowInstance<S> | undefined {
    const flow = this.flows.get(flowId);
    if (!flow || flow.isCompleted) return undefined;
    return flow as FlowInstance<S>;
  }

  save(flow: FlowInstance<any>): void {
    this.flows.set(flow.id, flow);
  }

  recordTransition(
    flowId: string, from: string | null, to: string, trigger: string, _ctx: FlowContext,
  ): void {
    this._transitionLog.push({ flowId, from, to, trigger, timestamp: new Date() });
  }

  get transitionLog(): readonly TransitionRecord[] {
    return this._transitionLog;
  }
}
