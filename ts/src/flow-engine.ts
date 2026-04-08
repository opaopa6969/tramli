import { FlowContext } from './flow-context.js';
import type { FlowDefinition } from './flow-definition.js';
import { FlowInstance } from './flow-instance.js';
import { FlowError } from './flow-error.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
import type { Transition, GuardOutput } from './types.js';

const MAX_CHAIN_DEPTH = 10;

/** Log entry types for tramli's pluggable logger API. */
export interface TransitionLogEntry { flowId: string; from: string | null; to: string; trigger: string }
export interface StateLogEntry { flowId: string; state: string; key: string; value: unknown }
export interface ErrorLogEntry { flowId: string; from: string | null; to: string | null; trigger: string; cause: Error | null }

export class FlowEngine {
  private readonly strictMode: boolean;
  private transitionLogger?: (entry: TransitionLogEntry) => void;
  private stateLogger?: (entry: StateLogEntry) => void;
  private errorLogger?: (entry: ErrorLogEntry) => void;

  constructor(private readonly store: InMemoryFlowStore, options?: { strictMode?: boolean }) {
    this.strictMode = options?.strictMode ?? false;
  }

  setTransitionLogger(logger: ((entry: TransitionLogEntry) => void) | null): void {
    this.transitionLogger = logger ?? undefined;
  }
  setStateLogger(logger: ((entry: StateLogEntry) => void) | null): void {
    this.stateLogger = logger ?? undefined;
  }
  setErrorLogger(logger: ((entry: ErrorLogEntry) => void) | null): void {
    this.errorLogger = logger ?? undefined;
  }
  removeAllLoggers(): void {
    this.transitionLogger = undefined;
    this.stateLogger = undefined;
    this.errorLogger = undefined;
  }

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
    const flow = this.store.loadForUpdate<S>(flowId, definition);
    if (!flow) throw new FlowError('FLOW_NOT_FOUND', `Flow ${flowId} not found or already completed`);

    if (externalData) {
      for (const [key, value] of externalData) flow.context.put(key as any, value);
    }

    if (new Date() > flow.expiresAt) {
      flow.complete('EXPIRED');
      this.store.save(flow);
      return flow;
    }

    // If actively in a sub-flow, delegate resume
    if (flow.activeSubFlow) {
      return this.resumeSubFlow(flow, definition);
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
          } catch (e: any) {
            flow.context.restoreFrom(backup);
            this.handleError(flow, currentState, e instanceof Error ? e : new Error(String(e)));
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

      // Check for sub-flow transition
      const subFlowT = transitions.find(t => t.type === 'sub_flow');
      if (subFlowT) {
        const advanced = await this.executeSubFlow(flow, subFlowT);
        depth += advanced;
        if (advanced === 0) break; // sub-flow stopped at external
        continue;
      }

      const autoOrBranch = transitions.find(t => t.type === 'auto' || t.type === 'branch');
      if (!autoOrBranch) break;

      const backup = flow.context.snapshot();
      try {
        if (autoOrBranch.type === 'auto') {
          if (autoOrBranch.processor) {
            await autoOrBranch.processor.process(flow.context);
            this.verifyProduces(autoOrBranch.processor, flow.context);
          }
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
      } catch (e: any) {
        flow.context.restoreFrom(backup);
        this.handleError(flow, flow.currentState, e instanceof Error ? e : new Error(String(e)));
        return;
      }
      depth++;
    }
    if (depth >= MAX_CHAIN_DEPTH) throw FlowError.maxChainDepth();
  }

  private async executeSubFlow<S extends string>(
    parentFlow: FlowInstance<S>, subFlowTransition: Transition<S>,
  ): Promise<number> {
    const subDef = subFlowTransition.subFlowDefinition!;
    const exitMappings = subFlowTransition.exitMappings!;
    const subInitial = subDef.initialState!;

    const subFlow = new FlowInstance(
      parentFlow.id, parentFlow.sessionId, subDef,
      parentFlow.context, subInitial, parentFlow.expiresAt,
    );
    parentFlow.setActiveSubFlow(subFlow);

    await this.executeAutoChain(subFlow);

    if (subFlow.isCompleted) {
      parentFlow.setActiveSubFlow(null);
      const target = exitMappings.get(subFlow.exitState!);
      if (target) {
        const from = parentFlow.currentState;
        parentFlow.transitionTo(target);
        this.store.recordTransition(parentFlow.id, from, target,
          `subFlow:${subDef.name}/${subFlow.exitState}`, parentFlow.context);
        return 1;
      }
      // Error bubbling: no exit mapping → fall back to parent's error transitions
      this.handleError(parentFlow, parentFlow.currentState);
      return 1;
    }
    return 0; // sub-flow stopped at external
  }

  private async resumeSubFlow<S extends string>(
    parentFlow: FlowInstance<S>, parentDef: FlowDefinition<S>,
  ): Promise<FlowInstance<S>> {
    const subFlow = parentFlow.activeSubFlow!;
    const subDef = subFlow.definition;

    const transition = subDef.externalFrom(subFlow.currentState);
    if (!transition) {
      throw new FlowError('INVALID_TRANSITION',
        `No external transition from sub-flow state ${subFlow.currentState}`);
    }

    const guard = transition.guard;
    if (guard) {
      const output: GuardOutput = await guard.validate(parentFlow.context);
      if (output.type === 'accepted') {
        if (output.data) {
          for (const [key, value] of output.data) parentFlow.context.put(key as any, value);
        }
        subFlow.transitionTo(transition.to);
        this.store.recordTransition(parentFlow.id, subFlow.currentState, transition.to,
          guard.name, parentFlow.context);
      } else if (output.type === 'rejected') {
        subFlow.incrementGuardFailure();
        if (subFlow.guardFailureCount >= subDef.maxGuardRetries) {
          subFlow.complete('ERROR');
        }
        this.store.save(parentFlow);
        return parentFlow;
      } else {
        parentFlow.complete('EXPIRED');
        this.store.save(parentFlow);
        return parentFlow;
      }
    } else {
      subFlow.transitionTo(transition.to);
    }

    await this.executeAutoChain(subFlow);

    if (subFlow.isCompleted) {
      parentFlow.setActiveSubFlow(null);
      const subFlowT = parentDef.transitionsFrom(parentFlow.currentState)
        .find(t => t.type === 'sub_flow');
      if (subFlowT?.exitMappings) {
        const target = subFlowT.exitMappings.get(subFlow.exitState!);
        if (target) {
          const from = parentFlow.currentState;
          parentFlow.transitionTo(target);
          this.store.recordTransition(parentFlow.id, from, target,
            `subFlow:${subDef.name}/${subFlow.exitState}`, parentFlow.context);
          await this.executeAutoChain(parentFlow);
        }
      }
    }

    this.store.save(parentFlow);
    return parentFlow;
  }

  private verifyProduces(processor: { name: string; produces: any[] }, ctx: FlowContext): void {
    if (!this.strictMode) return;
    for (const prod of processor.produces) {
      if (!ctx.has(prod)) {
        throw new FlowError('PRODUCES_VIOLATION',
          `Processor '${processor.name}' declares produces ${prod} but did not put it in context (strictMode)`);
      }
    }
  }

  private handleError<S extends string>(flow: FlowInstance<S>, fromState: S, cause?: Error): void {
    if (cause) {
      flow.setLastError(`${cause.constructor.name}: ${cause.message}`);
      if (cause instanceof FlowError) {
        const available = new Set<string>();
        for (const [k] of flow.context.snapshot()) available.add(k);
        cause.withContextSnapshot(available, new Set());
      }
    }
    this.errorLogger?.({ flowId: flow.id, from: fromState, to: null, trigger: 'error', cause: cause ?? null });

    // 1. Try exception-typed routes first (onStepError)
    if (cause && flow.definition.exceptionRoutes) {
      const routes = flow.definition.exceptionRoutes.get(fromState);
      if (routes) {
        for (const route of routes) {
          if (cause instanceof route.errorClass) {
            const from = flow.currentState;
            flow.transitionTo(route.target);
            this.store.recordTransition(flow.id, from, route.target,
              `error:${cause.constructor.name}`, flow.context);
            if (flow.definition.stateConfig[route.target].terminal) flow.complete(route.target);
            return;
          }
        }
      }
    }

    // 2. Fall back to state-based error transition (onError)
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
