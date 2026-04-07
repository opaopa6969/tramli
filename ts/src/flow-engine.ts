import { FlowContext } from './flow-context.js';
import type { FlowDefinition } from './flow-definition.js';
import { FlowInstance } from './flow-instance.js';
import { FlowError } from './flow-error.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
import type { Transition, GuardOutput } from './types.js';

const MAX_CHAIN_DEPTH = 10;

/**
 * Generic engine that drives all flow state machines.
 *
 * Exceptions:
 * - FLOW_NOT_FOUND: resumeAndExecute with unknown or completed flowId
 * - INVALID_TRANSITION: resumeAndExecute when no external transition exists
 * - MAX_CHAIN_DEPTH: auto-chain exceeded 10 steps
 * - EXPIRED: flow TTL exceeded at resumeAndExecute entry
 *
 * Processor and branch exceptions are caught and routed to error transitions.
 */
export class FlowEngine {
  constructor(private readonly store: InMemoryFlowStore) {}

  async startFlow<S extends string>(
    definition: FlowDefinition<S>, sessionId: string,
    initialData: Map<string, unknown>,
  ): Promise<FlowInstance<S>> {
    const flowId = crypto.randomUUID();
    const ctx = new FlowContext(flowId);
    for (const [key, value] of initialData) ctx.put(key as any, value);

    const initial = definition.initialState;
    if (!initial) throw new FlowError('INVALID_FLOW_DEFINITION', 'No initial state');
    const expiresAt = new Date(Date.now() + definition.ttl);
    const flow = new FlowInstance(flowId, sessionId, definition, ctx, initial, expiresAt);

    this.store.create(flow);
    await this.executeAutoChain(flow);
    this.store.save(flow);
    return flow;
  }

  async resumeAndExecute<S extends string>(
    flowId: string, definition: FlowDefinition<S>,
    externalData?: Map<string, unknown>,
  ): Promise<FlowInstance<S>> {
    const flow = this.store.loadForUpdate<S>(flowId);
    if (!flow) throw new FlowError('FLOW_NOT_FOUND', `Flow ${flowId} not found or already completed`);

    if (externalData) {
      for (const [key, value] of externalData) flow.context.put(key as any, value);
    }

    if (new Date() > flow.expiresAt) {
      flow.complete('EXPIRED');
      this.store.save(flow);
      return flow;
    }

    const currentState = flow.currentState;
    const transition = definition.externalFrom(currentState);
    if (!transition) throw FlowError.invalidTransition(currentState, currentState);

    const guard = transition.guard;
    if (guard) {
      const output: GuardOutput = await guard.validate(flow.context);
      switch (output.type) {
        case 'accepted': {
          const backup = flow.context.snapshot();
          if (output.data) {
            for (const [key, value] of output.data) flow.context.put(key as any, value);
          }
          try {
            if (transition.processor) await transition.processor.process(flow.context);
            const from = flow.currentState;
            flow.transitionTo(transition.to);
            this.store.recordTransition(flow.id, from, transition.to, guard.name, flow.context);
          } catch {
            flow.context.restoreFrom(backup);
            this.handleError(flow, currentState);
            this.store.save(flow);
            return flow;
          }
          break;
        }
        case 'rejected': {
          flow.incrementGuardFailure();
          if (flow.guardFailureCount >= definition.maxGuardRetries) {
            this.handleError(flow, currentState);
          }
          this.store.save(flow);
          return flow;
        }
        case 'expired': {
          flow.complete('EXPIRED');
          this.store.save(flow);
          return flow;
        }
      }
    } else {
      const from = flow.currentState;
      flow.transitionTo(transition.to);
      this.store.recordTransition(flow.id, from, transition.to, 'external', flow.context);
    }

    await this.executeAutoChain(flow);
    this.store.save(flow);
    return flow;
  }

  private async executeAutoChain<S extends string>(flow: FlowInstance<S>): Promise<void> {
    let depth = 0;
    while (depth < MAX_CHAIN_DEPTH) {
      const current = flow.currentState;
      if (flow.definition.stateConfig[current].terminal) {
        flow.complete(current);
        break;
      }

      const transitions = flow.definition.transitionsFrom(current);
      const autoOrBranch = transitions.find(t => t.type === 'auto' || t.type === 'branch');
      if (!autoOrBranch) break;

      const backup = flow.context.snapshot();
      try {
        if (autoOrBranch.type === 'auto') {
          if (autoOrBranch.processor) await autoOrBranch.processor.process(flow.context);
          const from = flow.currentState;
          flow.transitionTo(autoOrBranch.to);
          this.store.recordTransition(flow.id, from, autoOrBranch.to,
            autoOrBranch.processor?.name ?? 'auto', flow.context);
        } else {
          const branch = autoOrBranch.branch!;
          const label = await branch.decide(flow.context);
          const target = autoOrBranch.branchTargets.get(label);
          if (!target) {
            throw new FlowError('UNKNOWN_BRANCH',
              `Branch '${branch.name}' returned unknown label: ${label}`);
          }
          const specific = transitions.find(t => t.type === 'branch' && t.to === target) ?? autoOrBranch;
          if (specific.processor) await specific.processor.process(flow.context);
          const from = flow.currentState;
          flow.transitionTo(target);
          this.store.recordTransition(flow.id, from, target, `${branch.name}:${label}`, flow.context);
        }
      } catch {
        flow.context.restoreFrom(backup);
        this.handleError(flow, flow.currentState);
        return;
      }
      depth++;
    }
    if (depth >= MAX_CHAIN_DEPTH) throw FlowError.maxChainDepth();
  }

  private handleError<S extends string>(flow: FlowInstance<S>, fromState: S): void {
    const errorTarget = flow.definition.errorTransitions.get(fromState);
    if (errorTarget) {
      const from = flow.currentState;
      flow.transitionTo(errorTarget);
      this.store.recordTransition(flow.id, from, errorTarget, 'error', flow.context);
      if (flow.definition.stateConfig[errorTarget].terminal) flow.complete(errorTarget);
    } else {
      flow.complete('TERMINAL_ERROR');
    }
  }
}
