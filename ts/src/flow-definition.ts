import type { FlowKey } from './flow-key.js';
import type { StateConfig, Transition, TransitionType, StateProcessor, TransitionGuard, BranchProcessor } from './types.js';
import { FlowError } from './flow-error.js';

export class FlowDefinition<S extends string> {
  readonly name: string;
  readonly stateConfig: Record<S, StateConfig>;
  readonly ttl: number; // milliseconds
  readonly maxGuardRetries: number;
  readonly transitions: Transition<S>[];
  readonly errorTransitions: Map<S, S>;
  readonly initialState: S | null;
  readonly terminalStates: Set<S>;

  private constructor(
    name: string, stateConfig: Record<S, StateConfig>, ttl: number,
    maxGuardRetries: number, transitions: Transition<S>[], errorTransitions: Map<S, S>,
  ) {
    this.name = name;
    this.stateConfig = stateConfig;
    this.ttl = ttl;
    this.maxGuardRetries = maxGuardRetries;
    this.transitions = [...transitions];
    this.errorTransitions = new Map(errorTransitions);

    let initial: S | null = null;
    const terminals = new Set<S>();
    for (const [state, cfg] of Object.entries(stateConfig) as [S, StateConfig][]) {
      if (cfg.initial) initial = state;
      if (cfg.terminal) terminals.add(state);
    }
    this.initialState = initial;
    this.terminalStates = terminals;
  }

  transitionsFrom(state: S): Transition<S>[] {
    return this.transitions.filter(t => t.from === state);
  }

  externalFrom(state: S): Transition<S> | undefined {
    return this.transitions.find(t => t.from === state && t.type === 'external');
  }

  allStates(): S[] {
    return Object.keys(this.stateConfig) as S[];
  }

  // ─── Builder ─────────────────────────────────────────────

  static builder<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S> {
    return new Builder(name, stateConfig);
  }
}

export class Builder<S extends string> {
  private readonly name: string;
  private readonly stateConfig: Record<S, StateConfig>;
  private ttl = 5 * 60 * 1000; // 5 minutes
  private maxGuardRetries = 3;
  private readonly transitions: Transition<S>[] = [];
  private readonly errorTransitions = new Map<S, S>();
  private readonly initiallyAvailableKeys: string[] = [];

  constructor(name: string, stateConfig: Record<S, StateConfig>) {
    this.name = name;
    this.stateConfig = stateConfig;
  }

  initiallyAvailable(...keys: FlowKey<unknown>[]): this {
    for (const k of keys) this.initiallyAvailableKeys.push(k);
    return this;
  }

  setTtl(ms: number): this { this.ttl = ms; return this; }
  setMaxGuardRetries(max: number): this { this.maxGuardRetries = max; return this; }

  from(state: S): FromBuilder<S> {
    return new FromBuilder(this, state);
  }

  onError(from: S, to: S): this {
    this.errorTransitions.set(from, to);
    return this;
  }

  onAnyError(errorState: S): this {
    for (const s of Object.keys(this.stateConfig) as S[]) {
      if (!this.stateConfig[s].terminal) this.errorTransitions.set(s, errorState);
    }
    return this;
  }

  /** @internal */
  addTransition(t: Transition<S>): void { this.transitions.push(t); }

  build(): FlowDefinition<S> {
    const def = (FlowDefinition as any).builder(this.name, this.stateConfig) as unknown;
    // Build via private constructor
    const result = Object.create(FlowDefinition.prototype) as FlowDefinition<S>;
    Object.assign(result, {
      name: this.name,
      stateConfig: this.stateConfig,
      ttl: this.ttl,
      maxGuardRetries: this.maxGuardRetries,
      transitions: [...this.transitions],
      errorTransitions: new Map(this.errorTransitions),
    });
    // Compute initial/terminal
    let initial: S | null = null;
    const terminals = new Set<S>();
    for (const [state, cfg] of Object.entries(this.stateConfig) as [S, StateConfig][]) {
      if (cfg.initial) initial = state;
      if (cfg.terminal) terminals.add(state);
    }
    (result as any).initialState = initial;
    (result as any).terminalStates = terminals;

    this.validate(result);
    return result;
  }

  private validate(def: FlowDefinition<S>): void {
    const errors: string[] = [];
    if (!def.initialState) {
      errors.push('No initial state found (exactly one state must have initial=true)');
    }
    this.checkReachability(def, errors);
    this.checkPathToTerminal(def, errors);
    this.checkDag(def, errors);
    this.checkExternalUniqueness(def, errors);
    this.checkBranchCompleteness(def, errors);
    this.checkRequiresProduces(def, errors);
    this.checkAutoExternalConflict(def, errors);
    this.checkTerminalNoOutgoing(def, errors);

    if (errors.length > 0) {
      throw new FlowError('INVALID_FLOW_DEFINITION',
        `Flow '${this.name}' has ${errors.length} validation error(s):\n  - ${errors.join('\n  - ')}`);
    }
  }

  private checkReachability(def: FlowDefinition<S>, errors: string[]): void {
    if (!def.initialState) return;
    const visited = new Set<S>();
    const queue: S[] = [def.initialState];
    visited.add(def.initialState);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const t of def.transitionsFrom(current)) {
        if (!visited.has(t.to)) { visited.add(t.to); queue.push(t.to); }
      }
      const errTarget = def.errorTransitions.get(current);
      if (errTarget && !visited.has(errTarget)) { visited.add(errTarget); queue.push(errTarget); }
    }
    for (const s of def.allStates()) {
      if (!visited.has(s) && !def.stateConfig[s].terminal) {
        errors.push(`State ${s} is not reachable from ${def.initialState}`);
      }
    }
  }

  private checkPathToTerminal(def: FlowDefinition<S>, errors: string[]): void {
    if (!def.initialState) return;
    const visited = new Set<S>();
    if (!this.canReachTerminal(def, def.initialState, visited)) {
      errors.push(`No path from ${def.initialState} to any terminal state`);
    }
  }

  private canReachTerminal(def: FlowDefinition<S>, state: S, visited: Set<S>): boolean {
    if (def.stateConfig[state].terminal) return true;
    if (visited.has(state)) return false;
    visited.add(state);
    for (const t of def.transitionsFrom(state)) {
      if (this.canReachTerminal(def, t.to, visited)) return true;
    }
    const errTarget = def.errorTransitions.get(state);
    return errTarget !== undefined && this.canReachTerminal(def, errTarget, visited);
  }

  private checkDag(def: FlowDefinition<S>, errors: string[]): void {
    const autoGraph = new Map<S, Set<S>>();
    for (const t of def.transitions) {
      if (t.type === 'auto' || t.type === 'branch') {
        if (!autoGraph.has(t.from)) autoGraph.set(t.from, new Set());
        autoGraph.get(t.from)!.add(t.to);
      }
    }
    const visited = new Set<S>();
    const inStack = new Set<S>();
    for (const s of def.allStates()) {
      if (!visited.has(s) && this.hasCycle(autoGraph, s, visited, inStack)) {
        errors.push(`Auto/Branch transitions contain a cycle involving ${s}`);
        break;
      }
    }
  }

  private hasCycle(graph: Map<S, Set<S>>, node: S, visited: Set<S>, inStack: Set<S>): boolean {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of graph.get(node) ?? []) {
      if (inStack.has(neighbor)) return true;
      if (!visited.has(neighbor) && this.hasCycle(graph, neighbor, visited, inStack)) return true;
    }
    inStack.delete(node);
    return false;
  }

  private checkExternalUniqueness(def: FlowDefinition<S>, errors: string[]): void {
    const counts = new Map<S, number>();
    for (const t of def.transitions) {
      if (t.type === 'external') counts.set(t.from, (counts.get(t.from) ?? 0) + 1);
    }
    for (const [state, count] of counts) {
      if (count > 1) errors.push(`State ${state} has ${count} external transitions (max 1)`);
    }
  }

  private checkBranchCompleteness(def: FlowDefinition<S>, errors: string[]): void {
    const allStates = new Set(def.allStates());
    for (const t of def.transitions) {
      if (t.type === 'branch' && t.branchTargets.size > 0) {
        for (const [label, target] of t.branchTargets) {
          if (!allStates.has(target)) {
            errors.push(`Branch target '${label}' -> ${target} is not a valid state`);
          }
        }
      }
    }
  }

  private checkRequiresProduces(def: FlowDefinition<S>, errors: string[]): void {
    if (!def.initialState) return;
    const stateAvailable = new Map<S, Set<string>>();
    this.checkRequiresProducesFrom(def, def.initialState, new Set(this.initiallyAvailableKeys), stateAvailable, errors);
  }

  private checkRequiresProducesFrom(
    def: FlowDefinition<S>, state: S, available: Set<string>,
    stateAvailable: Map<S, Set<string>>, errors: string[],
  ): void {
    if (stateAvailable.has(state)) {
      const existing = stateAvailable.get(state)!;
      let isSubset = true;
      for (const a of available) { if (!existing.has(a)) { isSubset = false; break; } }
      if (isSubset) return;
      // intersection
      for (const a of [...existing]) { if (!available.has(a)) existing.delete(a); }
    } else {
      stateAvailable.set(state, new Set(available));
    }

    for (const t of def.transitionsFrom(state)) {
      const newAvailable = new Set(stateAvailable.get(state)!);
      if (t.guard) {
        for (const req of t.guard.requires) {
          if (!newAvailable.has(req))
            errors.push(`Guard '${t.guard.name}' at ${t.from} requires ${req} but it may not be available`);
        }
        for (const p of t.guard.produces) newAvailable.add(p);
      }
      if (t.branch) {
        for (const req of t.branch.requires) {
          if (!newAvailable.has(req))
            errors.push(`Branch '${t.branch.name}' at ${t.from} requires ${req} but it may not be available`);
        }
      }
      if (t.processor) {
        for (const req of t.processor.requires) {
          if (!newAvailable.has(req))
            errors.push(`Processor '${t.processor.name}' at ${t.from} -> ${t.to} requires ${req} but it may not be available`);
        }
        for (const p of t.processor.produces) newAvailable.add(p);
      }
      this.checkRequiresProducesFrom(def, t.to, newAvailable, stateAvailable, errors);
    }
  }

  private checkAutoExternalConflict(def: FlowDefinition<S>, errors: string[]): void {
    for (const state of def.allStates()) {
      const trans = def.transitionsFrom(state);
      const hasAuto = trans.some(t => t.type === 'auto' || t.type === 'branch');
      const hasExternal = trans.some(t => t.type === 'external');
      if (hasAuto && hasExternal) {
        errors.push(`State ${state} has both auto/branch and external transitions — auto takes priority, making external unreachable`);
      }
    }
  }

  private checkTerminalNoOutgoing(def: FlowDefinition<S>, errors: string[]): void {
    for (const t of def.transitions) {
      if (def.stateConfig[t.from].terminal) {
        errors.push(`Terminal state ${t.from} has an outgoing transition to ${t.to}`);
      }
    }
  }
}

export class FromBuilder<S extends string> {
  constructor(private readonly builder: Builder<S>, private readonly fromState: S) {}

  auto(to: S, processor: StateProcessor<S>): Builder<S> {
    this.builder.addTransition({
      from: this.fromState, to, type: 'auto', processor,
      guard: undefined, branch: undefined, branchTargets: new Map(),
    });
    return this.builder;
  }

  external(to: S, guard: TransitionGuard<S>, processor?: StateProcessor<S>): Builder<S> {
    this.builder.addTransition({
      from: this.fromState, to, type: 'external', processor,
      guard, branch: undefined, branchTargets: new Map(),
    });
    return this.builder;
  }

  branch(branch: BranchProcessor<S>): BranchBuilder<S> {
    return new BranchBuilder(this.builder, this.fromState, branch);
  }
}

export class BranchBuilder<S extends string> {
  private readonly targets = new Map<string, S>();
  private readonly processors = new Map<string, StateProcessor<S>>();

  constructor(
    private readonly builder: Builder<S>,
    private readonly fromState: S,
    private readonly branch: BranchProcessor<S>,
  ) {}

  to(state: S, label: string, processor?: StateProcessor<S>): this {
    this.targets.set(label, state);
    if (processor) this.processors.set(label, processor);
    return this;
  }

  endBranch(): Builder<S> {
    for (const [label, target] of this.targets) {
      this.builder.addTransition({
        from: this.fromState, to: target, type: 'branch',
        processor: this.processors.get(label),
        guard: undefined, branch: this.branch,
        branchTargets: new Map(this.targets),
      });
    }
    return this.builder;
  }
}
