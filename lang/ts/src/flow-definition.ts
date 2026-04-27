import type { FlowKey } from './flow-key.js';
import type { StateConfig, Transition, TransitionType, StateProcessor, TransitionGuard, BranchProcessor } from './types.js';
import { FlowError } from './flow-error.js';
import { DataFlowGraph } from './data-flow-graph.js';

/** Structured validation error returned by buildAndValidate(). */
export interface ValidationError {
  code: string;
  message: string;
  state?: string;
  transition?: string;
  missingTypes?: string[];
  component?: string;
  availableTypes?: string[];
}

/** Parse a raw error message into a structured ValidationError. */
function parseValidationError(msg: string): ValidationError {
  const result: ValidationError = { code: 'VALIDATION', message: msg };
  // "State X is not reachable from Y"
  const reach = msg.match(/State (\S+) is not reachable/);
  if (reach) { result.code = 'UNREACHABLE_STATE'; result.state = reach[1]; return result; }
  // "No path from X to any terminal"
  const path = msg.match(/No path from (\S+) to/);
  if (path) { result.code = 'NO_PATH_TO_TERMINAL'; result.state = path[1]; return result; }
  // "Processor 'X' at A -> B requires Y but it may not be available (available: [...])"
  const procReq = msg.match(/Processor '([^']+)' at (\S+) -> (\S+) requires (\S+) but it may not be available/);
  if (procReq) {
    result.code = 'MISSING_REQUIRES'; result.component = 'processor';
    result.transition = `${procReq[2]}->${procReq[3]}`; result.missingTypes = [procReq[4]];
    const avail = msg.match(/\(available: \[([^\]]*)\]\)/);
    if (avail) result.availableTypes = avail[1] ? avail[1].split(', ') : [];
    return result;
  }
  // "Guard 'X' at A requires Y but it may not be available (available: [...])"
  const guardReq = msg.match(/Guard '([^']+)' at (\S+) requires (\S+) but it may not be available/);
  if (guardReq) {
    result.code = 'MISSING_REQUIRES'; result.component = 'guard';
    result.state = guardReq[2]; result.missingTypes = [guardReq[3]];
    const avail = msg.match(/\(available: \[([^\]]*)\]\)/);
    if (avail) result.availableTypes = avail[1] ? avail[1].split(', ') : [];
    return result;
  }
  // "Branch 'X' at A requires Y but it may not be available (available: [...])"
  const branchReq = msg.match(/Branch '([^']+)' at (\S+) requires (\S+) but it may not be available/);
  if (branchReq) {
    result.code = 'MISSING_REQUIRES'; result.component = 'branch';
    result.state = branchReq[2]; result.missingTypes = [branchReq[3]];
    const avail = msg.match(/\(available: \[([^\]]*)\]\)/);
    if (avail) result.availableTypes = avail[1] ? avail[1].split(', ') : [];
    return result;
  }
  // "Auto/Branch transitions contain a cycle"
  if (msg.includes('cycle')) { result.code = 'DAG_CYCLE'; return result; }
  // "State X has both auto/branch and external"
  const conflict = msg.match(/State (\S+) has both/);
  if (conflict) { result.code = 'AUTO_EXTERNAL_CONFLICT'; result.state = conflict[1]; return result; }
  // "Terminal state X has an outgoing transition"
  const term = msg.match(/Terminal state (\S+)/);
  if (term) { result.code = 'TERMINAL_OUTGOING'; result.state = term[1]; return result; }
  return result;
}

export class FlowDefinition<S extends string> {
  readonly name: string;
  readonly stateConfig: Record<S, StateConfig>;
  readonly ttl: number; // milliseconds
  readonly maxGuardRetries: number;
  readonly transitions: Transition<S>[];
  readonly errorTransitions: Map<S, S>;
  readonly initialState: S | null;
  readonly terminalStates: Set<S>;
  readonly dataFlowGraph!: DataFlowGraph<S> | null;
  readonly strictMode!: boolean;
  readonly warnings!: string[];
  readonly exceptionRoutes!: Map<S, Array<{ errorClass: new (...args: any[]) => Error; target: S }>>;
  readonly enterActions!: Map<S, (ctx: import('./flow-context.js').FlowContext) => void>;
  readonly exitActions!: Map<S, (ctx: import('./flow-context.js').FlowContext) => void>;

  /** Get enter action for a state (or undefined). */
  enterAction(state: S): ((ctx: import('./flow-context.js').FlowContext) => void) | undefined {
    return this.enterActions?.get(state);
  }
  /** Get exit action for a state (or undefined). */
  exitAction(state: S): ((ctx: import('./flow-context.js').FlowContext) => void) | undefined {
    return this.exitActions?.get(state);
  }

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

  /** All external transitions from a state (for multi-external). */
  externalsFrom(state: S): Transition<S>[] {
    return this.transitions.filter(t => t.from === state && t.type === 'external');
  }

  allStates(): S[] {
    return Object.keys(this.stateConfig) as S[];
  }

  /**
   * Create a new FlowDefinition with a sub-flow inserted before a specific transition.
   */
  withPlugin(from: S, to: S, pluginFlow: FlowDefinition<any>): FlowDefinition<S> {
    const newTransitions: Transition<S>[] = [];
    let replaced = false;
    for (const t of this.transitions) {
      if (t.from === from && t.to === to && !replaced) {
        const exitMap = new Map<string, S>();
        for (const terminal of pluginFlow.terminalStates) exitMap.set(terminal, to);
        newTransitions.push({
          from, to: from, type: 'sub_flow',
          processor: t.processor, guard: undefined, branch: undefined,
          branchTargets: new Map(),
          subFlowDefinition: pluginFlow, exitMappings: exitMap,
        });
        replaced = true;
      } else {
        newTransitions.push(t);
      }
    }
    const result = Object.create(FlowDefinition.prototype) as FlowDefinition<S>;
    Object.assign(result, {
      name: this.name + '+plugin:' + pluginFlow.name,
      stateConfig: this.stateConfig, ttl: this.ttl,
      maxGuardRetries: this.maxGuardRetries,
      transitions: newTransitions,
      errorTransitions: new Map(this.errorTransitions),
      initialState: this.initialState,
      terminalStates: this.terminalStates,
      dataFlowGraph: this.dataFlowGraph, // reuse parent's graph
      warnings: this.warnings,
      exceptionRoutes: this.exceptionRoutes ? new Map(this.exceptionRoutes) : new Map(),
      enterActions: this.enterActions ? new Map(this.enterActions) : new Map(),
      exitActions: this.exitActions ? new Map(this.exitActions) : new Map(),
    });
    return result;
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
  private readonly _exceptionRoutes = new Map<S, Array<{ errorClass: new (...args: any[]) => Error; target: S }>>();
  private readonly _enterActions = new Map<S, (ctx: import('./flow-context.js').FlowContext) => void>();
  private readonly _exitActions = new Map<S, (ctx: import('./flow-context.js').FlowContext) => void>();
  private readonly initiallyAvailableKeys: string[] = [];
  private readonly externallyProvidedKeys: string[] = [];
  private _perpetual = false;
  private _strictMode = false;
  private _allowUnreachable = false;

  constructor(name: string, stateConfig: Record<S, StateConfig>) {
    this.name = name;
    this.stateConfig = stateConfig;
  }

  initiallyAvailable(...keys: FlowKey<unknown>[]): this {
    for (const k of keys) this.initiallyAvailableKeys.push(k);
    return this;
  }

  /** Declare data keys injected via resumeAndExecute(externalData), not available at start. */
  externallyProvided(...keys: FlowKey<unknown>[]): this {
    for (const k of keys) this.externallyProvidedKeys.push(k);
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

  /** Route specific error types to specific states. Checked before onError. */
  onStepError(from: S, errorClass: new (...args: any[]) => Error, to: S): this {
    if (!this._exceptionRoutes.has(from)) this._exceptionRoutes.set(from, []);
    this._exceptionRoutes.get(from)!.push({ errorClass, target: to });
    return this;
  }

  onAnyError(errorState: S): this {
    for (const s of Object.keys(this.stateConfig) as S[]) {
      if (!this.stateConfig[s].terminal) this.errorTransitions.set(s, errorState);
    }
    return this;
  }

  /** Callback when entering a state (pure data/metrics, no I/O). */
  onStateEnter(state: S, action: (ctx: import('./flow-context.js').FlowContext) => void): this {
    this._enterActions.set(state, action);
    return this;
  }

  /** Callback when exiting a state (pure data/metrics, no I/O). */
  onStateExit(state: S, action: (ctx: import('./flow-context.js').FlowContext) => void): this {
    this._exitActions.set(state, action);
    return this;
  }

  /** Allow perpetual flows (no terminal states). Skips path-to-terminal validation. */
  allowPerpetual(): this { this._perpetual = true; return this; }

  /** Allow unreachable states (shared enum across multiple flows). Skips reachability check. */
  allowUnreachable(): this { this._allowUnreachable = true; return this; }

  /** Declare that this flow should run in strict mode (produces verification). */
  strictMode(): this { this._strictMode = true; return this; }

  /** @internal */
  addTransition(t: Transition<S>): void { this.transitions.push(t); }

  build(): FlowDefinition<S> {
    const def = this.buildInternal();
    this.validate(def);
    this.finalize(def);
    return def;
  }

  /** Build without throwing. Returns definition (if valid) + structured errors + diagnostic graph. */
  buildAndValidate(): { definition: FlowDefinition<S> | null; errors: ValidationError[]; diagnosticGraph: DataFlowGraph<S> | null } {
    try {
      const def = this.buildInternal();
      const errors = this.collectErrors(def);
      if (errors.length > 0) {
        let diagnosticGraph: DataFlowGraph<S> | null = null;
        try {
          diagnosticGraph = DataFlowGraph.build(def, this.initiallyAvailableKeys, this.externallyProvidedKeys);
        } catch { /* best-effort */ }
        return { definition: null, errors, diagnosticGraph };
      }
      this.finalize(def);
      return { definition: def, errors: [], diagnosticGraph: def.dataFlowGraph };
    } catch (e: any) {
      return { definition: null, errors: [{ code: 'BUILD_ERROR', message: e.message }], diagnosticGraph: null };
    }
  }

  private buildInternal(): FlowDefinition<S> {
    const result = Object.create(FlowDefinition.prototype) as FlowDefinition<S>;
    Object.assign(result, {
      name: this.name,
      stateConfig: this.stateConfig,
      ttl: this.ttl,
      maxGuardRetries: this.maxGuardRetries,
      transitions: [...this.transitions],
      errorTransitions: new Map(this.errorTransitions),
    });
    let initial: S | null = null;
    const terminals = new Set<S>();
    for (const [state, cfg] of Object.entries(this.stateConfig) as [S, StateConfig][]) {
      if (cfg.initial) initial = state;
      if (cfg.terminal) terminals.add(state);
    }
    (result as any).initialState = initial;
    (result as any).terminalStates = terminals;
    (result as any).dataFlowGraph = null;
    return result;
  }

  private finalize(def: FlowDefinition<S>): void {
    (def as any).dataFlowGraph = DataFlowGraph.build(def, this.initiallyAvailableKeys, this.externallyProvidedKeys);
    const warnings: string[] = [];
    const perpetual = def.terminalStates.size === 0;
    const hasExternal = this.transitions.some(t => t.type === 'external');
    if (perpetual && hasExternal) {
      warnings.push(`Perpetual flow '${this.name}' has External transitions — ensure events are always delivered to avoid deadlock (liveness risk)`);
    }
    (def as any).warnings = warnings;
    (def as any).strictMode = this._strictMode;
    (def as any).exceptionRoutes = new Map(this._exceptionRoutes);
    (def as any).enterActions = new Map(this._enterActions);
    (def as any).exitActions = new Map(this._exitActions);
  }

  private collectErrors(def: FlowDefinition<S>): ValidationError[] {
    const raw: string[] = [];
    if (!def.initialState) raw.push('No initial state found (exactly one state must have initial=true)');
    if (!this._allowUnreachable) this.checkReachability(def, raw);
    if (!this._perpetual) this.checkPathToTerminal(def, raw);
    this.checkDag(def, raw);
    this.checkBranchCompleteness(def, raw);
    this.checkRequiresProduces(def, raw);
    this.checkAutoExternalConflict(def, raw);
    this.checkTerminalNoOutgoing(def, raw);
    this.checkSubFlowExitCompleteness(def, raw);
    this.checkSubFlowNestingDepth(def, raw, 0);
    this.checkSubFlowCircularRef(def, raw, new Set());
    return raw.map(msg => parseValidationError(msg));
  }

  private validate(def: FlowDefinition<S>): void {
    const errors = this.collectErrors(def);
    if (errors.length > 0) {
      throw new FlowError('INVALID_FLOW_DEFINITION',
        `Flow '${this.name}' has ${errors.length} validation error(s):\n  - ${errors.map(e => e.message).join('\n  - ')}`);
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
        if (t.type === 'sub_flow' && t.exitMappings) {
          for (const target of t.exitMappings.values()) {
            if (!visited.has(target)) { visited.add(target); queue.push(target); }
          }
          continue;
        }
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
      if (t.type === 'sub_flow' && t.exitMappings) {
        for (const target of t.exitMappings.values()) {
          if (this.canReachTerminal(def, target, visited)) return true;
        }
        continue;
      }
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
      if (t.type === 'external') {
        for (const k of this.externallyProvidedKeys) newAvailable.add(k);
      }
      const availList = () => `(available: [${[...newAvailable].sort().join(', ')}])`;
      if (t.guard) {
        for (const req of t.guard.requires) {
          if (!newAvailable.has(req))
            errors.push(`Guard '${t.guard.name}' at ${t.from} requires ${req} but it may not be available ${availList()}`);
        }
        for (const p of t.guard.produces) newAvailable.add(p);
      }
      if (t.branch) {
        for (const req of t.branch.requires) {
          if (!newAvailable.has(req))
            errors.push(`Branch '${t.branch.name}' at ${t.from} requires ${req} but it may not be available ${availList()}`);
        }
      }
      if (t.processor) {
        for (const req of t.processor.requires) {
          if (!newAvailable.has(req))
            errors.push(`Processor '${t.processor.name}' at ${t.from} -> ${t.to} requires ${req} but it may not be available ${availList()}`);
        }
        for (const p of t.processor.produces) newAvailable.add(p);
      }
      this.checkRequiresProducesFrom(def, t.to, newAvailable, stateAvailable, errors);

      // Error path analysis: if processor fails, its produces are NOT available
      if (t.processor) {
        const errorTarget = def.errorTransitions.get(t.from);
        if (errorTarget) {
          const errorAvailable = new Set(stateAvailable.get(state)!);
          if (t.guard) { for (const p of t.guard.produces) errorAvailable.add(p); }
          this.checkRequiresProducesFrom(def, errorTarget, errorAvailable, stateAvailable, errors);
        }
      }
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
      if (def.stateConfig[t.from].terminal && t.type !== 'sub_flow') {
        errors.push(`Terminal state ${t.from} has an outgoing transition to ${t.to}`);
      }
    }
  }

  private checkSubFlowNestingDepth(def: FlowDefinition<any>, errors: string[], depth: number): void {
    if (depth > 3) {
      errors.push(`SubFlow nesting depth exceeds maximum of 3 (flow: ${def.name})`);
      return;
    }
    for (const t of def.transitions) {
      if (t.type === 'sub_flow' && t.subFlowDefinition) {
        this.checkSubFlowNestingDepth(t.subFlowDefinition, errors, depth + 1);
      }
    }
  }

  private checkSubFlowCircularRef(def: FlowDefinition<any>, errors: string[], visited: Set<string>): void {
    if (visited.has(def.name)) {
      errors.push(`Circular sub-flow reference detected: ${[...visited].join(' -> ')} -> ${def.name}`);
      return;
    }
    visited.add(def.name);
    for (const t of def.transitions) {
      if (t.type === 'sub_flow' && t.subFlowDefinition) {
        this.checkSubFlowCircularRef(t.subFlowDefinition, errors, new Set(visited));
      }
    }
  }

  private checkSubFlowExitCompleteness(def: FlowDefinition<S>, errors: string[]): void {
    for (const t of def.transitions) {
      if (t.type !== 'sub_flow' || !t.subFlowDefinition) continue;
      const subDef = t.subFlowDefinition;
      for (const terminal of subDef.terminalStates) {
        if (!t.exitMappings?.has(terminal)) {
          errors.push(`SubFlow '${subDef.name}' at ${t.from} has terminal state ${terminal} with no onExit mapping`);
        }
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

  external(to: S, guard: TransitionGuard<S>, processorOrOptions?: StateProcessor<S> | { processor?: StateProcessor<S>; timeout?: number }): Builder<S> {
    let processor: StateProcessor<S> | undefined;
    let timeout: number | undefined;
    if (processorOrOptions && 'process' in processorOrOptions) {
      processor = processorOrOptions as StateProcessor<S>;
    } else if (processorOrOptions) {
      const opts = processorOrOptions as { processor?: StateProcessor<S>; timeout?: number };
      processor = opts.processor;
      timeout = opts.timeout;
    }
    this.builder.addTransition({
      from: this.fromState, to, type: 'external', processor,
      guard, branch: undefined, branchTargets: new Map(), timeout,
    });
    return this.builder;
  }

  branch(branch: BranchProcessor<S>): BranchBuilder<S> {
    return new BranchBuilder(this.builder, this.fromState, branch);
  }

  subFlow(subFlowDef: FlowDefinition<any>): SubFlowBuilder<S> {
    return new SubFlowBuilder(this.builder, this.fromState, subFlowDef);
  }
}

export class SubFlowBuilder<S extends string> {
  private readonly exitMap = new Map<string, S>();

  constructor(
    private readonly builder: Builder<S>,
    private readonly fromState: S,
    private readonly subFlowDef: FlowDefinition<any>,
  ) {}

  onExit(terminalName: string, parentState: S): this {
    this.exitMap.set(terminalName, parentState);
    return this;
  }

  endSubFlow(): Builder<S> {
    this.builder.addTransition({
      from: this.fromState, to: this.fromState, type: 'sub_flow',
      processor: undefined, guard: undefined, branch: undefined,
      branchTargets: new Map(),
      subFlowDefinition: this.subFlowDef,
      exitMappings: new Map(this.exitMap),
    });
    return this.builder;
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
        branchLabel: label,
      });
    }
    return this.builder;
  }
}
