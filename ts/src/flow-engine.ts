import { FlowContext } from './flow-context.js';
import type { FlowDefinition } from './flow-definition.js';
import { FlowInstance } from './flow-instance.js';
import { FlowError } from './flow-error.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
import type { Transition, GuardOutput } from './types.js';

/** Default max auto-chain depth. Override via constructor options. */
export const DEFAULT_MAX_CHAIN_DEPTH = 10;

/** Log entry types for tramli's pluggable logger API. */
export interface TransitionLogEntry { flowId: string; flowName: string; from: string | null; to: string; trigger: string; durationMicros: number }
export interface StateLogEntry { flowId: string; flowName: string; state: string; key: string; value: unknown }
export interface ErrorLogEntry { flowId: string; flowName: string; from: string | null; to: string | null; trigger: string; cause: Error | null; durationMicros: number }
export interface GuardLogEntry { flowId: string; flowName: string; state: string; guardName: string; result: 'accepted' | 'rejected' | 'expired'; reason?: string; durationMicros: number }

export class FlowEngine {
  private readonly strictMode: boolean;
  private readonly maxChainDepth: number;
  private transitionLogger?: (entry: TransitionLogEntry) => void;
  private stateLogger?: (entry: StateLogEntry) => void;
  private errorLogger?: (entry: ErrorLogEntry) => void;
  private guardLogger?: (entry: GuardLogEntry) => void;

  constructor(private readonly store: InMemoryFlowStore, options?: { strictMode?: boolean; maxChainDepth?: number }) {
    this.strictMode = options?.strictMode ?? false;
    this.maxChainDepth = options?.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
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
  setGuardLogger(logger: ((entry: GuardLogEntry) => void) | null): void {
    this.guardLogger = logger ?? undefined;
  }
  getTransitionLogger(): ((entry: TransitionLogEntry) => void) | undefined { return this.transitionLogger; }
  getStateLogger(): ((entry: StateLogEntry) => void) | undefined { return this.stateLogger; }
  getErrorLogger(): ((entry: ErrorLogEntry) => void) | undefined { return this.errorLogger; }
  getGuardLogger(): ((entry: GuardLogEntry) => void) | undefined { return this.guardLogger; }

  removeAllLoggers(): void {
    this.transitionLogger = undefined;
    this.stateLogger = undefined;
    this.errorLogger = undefined;
    this.guardLogger = undefined;
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

    // Multi-external: select guard by requires matching
    const externals = definition.externalsFrom(currentState);
    if (externals.length === 0) throw FlowError.invalidTransition(currentState, currentState);

    let transition: Transition<S> | undefined;
    const dataKeys = externalData ? new Set(externalData.keys()) : new Set<string>();
    for (const ext of externals) {
      if (ext.guard && ext.guard.requires.every(r => dataKeys.has(r))) {
        transition = ext;
        break;
      }
    }
    if (!transition) {
      // Fallback: first external
      transition = externals[0];
    }

    // Per-state timeout check
    if (transition.timeout != null) {
      const deadline = new Date(flow.stateEnteredAt.getTime() + transition.timeout);
      if (new Date() > deadline) {
        flow.complete('EXPIRED');
        this.store.save(flow);
        return flow;
      }
    }

    const guard = transition.guard;
    if (guard) {
      const guardStart = performance.now();
      const output: GuardOutput = await guard.validate(flow.context);
      const guardDurationMicros = Math.round((performance.now() - guardStart) * 1000);
      switch (output.type) {
        case 'accepted': {
          this.logGuard(flow, currentState, guard.name, 'accepted', guardDurationMicros);
          const transStart = performance.now();
          const backup = flow.context.snapshot();
          if (output.data) {
            for (const [key, value] of output.data) flow.context.put(key as any, value);
          }
          try {
            if (transition.processor) await transition.processor.process(flow.context);
            const from = flow.currentState;
            this.fireExit(flow, from);
            flow.transitionTo(transition.to);
            this.fireEnter(flow, transition.to);
            this.store.recordTransition(flow.id, from, transition.to, guard.name, flow.context);
            this.logTransition(flow, from, transition.to, guard.name, transStart);
          } catch (e: any) {
            flow.context.restoreFrom(backup);
            this.handleError(flow, currentState, e instanceof Error ? e : new Error(String(e)));
            this.store.save(flow);
            return flow;
          }
          break;
        }
        case 'rejected': {
          this.logGuard(flow, currentState, guard.name, 'rejected', guardDurationMicros, output.reason);
          flow.incrementGuardFailure(guard.name);
          if (flow.guardFailureCount >= definition.maxGuardRetries) {
            this.handleError(flow, currentState);
          }
          this.store.save(flow);
          return flow;
        }
        case 'expired': {
          this.logGuard(flow, currentState, guard.name, 'expired', guardDurationMicros);
          flow.complete('EXPIRED');
          this.store.save(flow);
          return flow;
        }
      }
    } else {
      const transStart = performance.now();
      const from = flow.currentState;
      this.fireExit(flow, from);
      flow.transitionTo(transition.to);
      this.fireEnter(flow, transition.to);
      this.store.recordTransition(flow.id, from, transition.to, 'external', flow.context);
      this.logTransition(flow, from, transition.to, 'external', transStart);
    }

    await this.executeAutoChain(flow);
    this.store.save(flow);
    return flow;
  }

  private async executeAutoChain<S extends string>(flow: FlowInstance<S>): Promise<void> {
    let depth = 0;
    while (depth < this.maxChainDepth) {
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
      const stepStart = performance.now();
      try {
        if (autoOrBranch.type === 'auto') {
          if (autoOrBranch.processor) {
            await autoOrBranch.processor.process(flow.context);
            this.verifyProduces(autoOrBranch.processor, flow.context, flow.definition.strictMode);
          }
          const from = flow.currentState;
          this.fireExit(flow, from);
          flow.transitionTo(autoOrBranch.to);
          this.fireEnter(flow, autoOrBranch.to);
          const trigger = autoOrBranch.processor?.name ?? 'auto';
          this.store.recordTransition(flow.id, from, autoOrBranch.to, trigger, flow.context);
          this.logTransition(flow, from, autoOrBranch.to, trigger, stepStart);
        } else {
          const branch = autoOrBranch.branch!;
          const label = await branch.decide(flow.context);
          const target = autoOrBranch.branchTargets.get(label);
          if (!target) {
            throw new FlowError('UNKNOWN_BRANCH',
              `Branch '${branch.name}' returned unknown label: ${label}`);
          }
          const specific = transitions.find(t => t.type === 'branch' && t.branchLabel === label) ?? transitions.find(t => t.type === 'branch' && t.to === target) ?? autoOrBranch;
          if (specific.processor) await specific.processor.process(flow.context);
          const from = flow.currentState;
          this.fireExit(flow, from);
          flow.transitionTo(target);
          this.fireEnter(flow, target);
          const trigger = `${branch.name}:${label}`;
          this.store.recordTransition(flow.id, from, target, trigger, flow.context);
          this.logTransition(flow, from, target, trigger, stepStart);
        }
      } catch (e: any) {
        flow.context.restoreFrom(backup);
        this.handleError(flow, flow.currentState, e instanceof Error ? e : new Error(String(e)));
        return;
      }
      depth++;
    }
    if (depth >= this.maxChainDepth) throw FlowError.maxChainDepth();
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
        const sfStart = performance.now();
        const from = parentFlow.currentState;
        this.fireExit(parentFlow, from);
        parentFlow.transitionTo(target);
        this.fireEnter(parentFlow, target);
        const trigger = `subFlow:${subDef.name}/${subFlow.exitState}`;
        this.store.recordTransition(parentFlow.id, from, target, trigger, parentFlow.context);
        this.logTransition(parentFlow, from, target, trigger, sfStart);
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
      const guardStart = performance.now();
      const output: GuardOutput = await guard.validate(parentFlow.context);
      const guardDur = Math.round((performance.now() - guardStart) * 1000);
      if (output.type === 'accepted') {
        if (output.data) {
          for (const [key, value] of output.data) parentFlow.context.put(key as any, value);
        }
        const sfStart = performance.now();
        const sfFrom = subFlow.currentState;
        subFlow.transitionTo(transition.to);
        this.store.recordTransition(parentFlow.id, sfFrom, transition.to, guard.name, parentFlow.context);
        this.logTransition(parentFlow, sfFrom, transition.to, guard.name, sfStart);
        this.logGuard(parentFlow, sfFrom, guard.name, 'accepted', guardDur);
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
          const exitStart = performance.now();
          const from = parentFlow.currentState;
          this.fireExit(parentFlow, from);
          parentFlow.transitionTo(target);
          this.fireEnter(parentFlow, target);
          const trigger = `subFlow:${subDef.name}/${subFlow.exitState}`;
          this.store.recordTransition(parentFlow.id, from, target, trigger, parentFlow.context);
          this.logTransition(parentFlow, from, target, trigger, exitStart);
          await this.executeAutoChain(parentFlow);
        }
      }
    }

    this.store.save(parentFlow);
    return parentFlow;
  }

  private verifyProduces(processor: { name: string; produces: any[] }, ctx: FlowContext, defStrictMode?: boolean): void {
    if (!this.strictMode && !defStrictMode) return;
    for (const prod of processor.produces) {
      if (!ctx.has(prod)) {
        throw new FlowError('PRODUCES_VIOLATION',
          `Processor '${processor.name}' declares produces ${prod} but did not put it in context (strictMode)`);
      }
    }
  }

  private fireEnter<S extends string>(flow: FlowInstance<S>, state: S): void {
    const action = flow.definition.enterAction(state);
    if (action) action(flow.context);
  }

  private fireExit<S extends string>(flow: FlowInstance<S>, state: S): void {
    const action = flow.definition.exitAction(state);
    if (action) action(flow.context);
  }

  private logTransition<S extends string>(flow: FlowInstance<S>, from: string | null, to: string, trigger: string, startMs: number): void {
    if (this.transitionLogger) {
      const durationMicros = Math.round((performance.now() - startMs) * 1000);
      this.transitionLogger({ flowId: flow.id, flowName: flow.definition.name, from, to, trigger, durationMicros });
    }
  }

  private logError<S extends string>(flow: FlowInstance<S>, from: string | null, to: string | null, trigger: string, cause: Error | null, startMs: number): void {
    if (this.errorLogger) {
      const durationMicros = Math.round((performance.now() - startMs) * 1000);
      this.errorLogger({ flowId: flow.id, flowName: flow.definition.name, from, to, trigger, cause, durationMicros });
    }
  }

  private logGuard<S extends string>(flow: FlowInstance<S>, state: string, guardName: string, result: 'accepted' | 'rejected' | 'expired', durationMicros: number, reason?: string): void {
    this.guardLogger?.({ flowId: flow.id, flowName: flow.definition.name, state, guardName, result, reason, durationMicros });
  }

  private handleError<S extends string>(flow: FlowInstance<S>, fromState: S, cause?: Error): void {
    const errorStart = performance.now();
    if (cause) {
      flow.setLastError(`${cause.constructor.name}: ${cause.message}`);
      if (cause instanceof FlowError) {
        const available = new Set<string>();
        for (const [k] of flow.context.snapshot()) available.add(k);
        cause.withContextSnapshot(available, new Set());
      }
    }
    this.logError(flow, fromState, null, 'error', cause ?? null, errorStart);

    // 1. Try exception-typed routes first (onStepError)
    if (cause && flow.definition.exceptionRoutes) {
      const routes = flow.definition.exceptionRoutes.get(fromState);
      if (routes) {
        for (const route of routes) {
          if (cause instanceof route.errorClass) {
            const from = flow.currentState;
            flow.transitionTo(route.target);
            const trigger = `error:${cause.constructor.name}`;
            this.store.recordTransition(flow.id, from, route.target, trigger, flow.context);
            this.logTransition(flow, from, route.target, trigger, errorStart);
            if (flow.definition.stateConfig[route.target]?.terminal) flow.complete(route.target);
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
      this.logTransition(flow, from, errorTarget, 'error', errorStart);
      if (flow.definition.stateConfig[errorTarget]?.terminal) flow.complete(errorTarget);
    } else {
      flow.complete('TERMINAL_ERROR');
    }
  }
}
