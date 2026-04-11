import type { FlowKey } from './flow-key.js';
import type { StateConfig, Transition, StateProcessor, TransitionGuard, BranchProcessor } from './types.js';
import { DataFlowGraph } from './data-flow-graph.js';
/** Structured validation error returned by buildAndValidate(). */
export interface ValidationError {
    code: string;
    message: string;
    state?: string;
    transition?: string;
    missingTypes?: string[];
}
export declare class FlowDefinition<S extends string> {
    readonly name: string;
    readonly stateConfig: Record<S, StateConfig>;
    readonly ttl: number;
    readonly maxGuardRetries: number;
    readonly transitions: Transition<S>[];
    readonly errorTransitions: Map<S, S>;
    readonly initialState: S | null;
    readonly terminalStates: Set<S>;
    readonly dataFlowGraph: DataFlowGraph<S> | null;
    readonly strictMode: boolean;
    readonly warnings: string[];
    readonly exceptionRoutes: Map<S, Array<{
        errorClass: new (...args: any[]) => Error;
        target: S;
    }>>;
    readonly enterActions: Map<S, (ctx: import('./flow-context.js').FlowContext) => void>;
    readonly exitActions: Map<S, (ctx: import('./flow-context.js').FlowContext) => void>;
    /** Get enter action for a state (or undefined). */
    enterAction(state: S): ((ctx: import('./flow-context.js').FlowContext) => void) | undefined;
    /** Get exit action for a state (or undefined). */
    exitAction(state: S): ((ctx: import('./flow-context.js').FlowContext) => void) | undefined;
    private constructor();
    transitionsFrom(state: S): Transition<S>[];
    externalFrom(state: S): Transition<S> | undefined;
    /** All external transitions from a state (for multi-external). */
    externalsFrom(state: S): Transition<S>[];
    allStates(): S[];
    /**
     * Create a new FlowDefinition with a sub-flow inserted before a specific transition.
     */
    withPlugin(from: S, to: S, pluginFlow: FlowDefinition<any>): FlowDefinition<S>;
    static builder<S extends string>(name: string, stateConfig: Record<S, StateConfig>): Builder<S>;
}
export declare class Builder<S extends string> {
    private readonly name;
    private readonly stateConfig;
    private ttl;
    private maxGuardRetries;
    private readonly transitions;
    private readonly errorTransitions;
    private readonly _exceptionRoutes;
    private readonly _enterActions;
    private readonly _exitActions;
    private readonly initiallyAvailableKeys;
    private readonly externallyProvidedKeys;
    private _perpetual;
    private _strictMode;
    private _allowUnreachable;
    constructor(name: string, stateConfig: Record<S, StateConfig>);
    initiallyAvailable(...keys: FlowKey<unknown>[]): this;
    /** Declare data keys injected via resumeAndExecute(externalData), not available at start. */
    externallyProvided(...keys: FlowKey<unknown>[]): this;
    setTtl(ms: number): this;
    setMaxGuardRetries(max: number): this;
    from(state: S): FromBuilder<S>;
    onError(from: S, to: S): this;
    /** Route specific error types to specific states. Checked before onError. */
    onStepError(from: S, errorClass: new (...args: any[]) => Error, to: S): this;
    onAnyError(errorState: S): this;
    /** Callback when entering a state (pure data/metrics, no I/O). */
    onStateEnter(state: S, action: (ctx: import('./flow-context.js').FlowContext) => void): this;
    /** Callback when exiting a state (pure data/metrics, no I/O). */
    onStateExit(state: S, action: (ctx: import('./flow-context.js').FlowContext) => void): this;
    /** Allow perpetual flows (no terminal states). Skips path-to-terminal validation. */
    allowPerpetual(): this;
    /** Allow unreachable states (shared enum across multiple flows). Skips reachability check. */
    allowUnreachable(): this;
    /** Declare that this flow should run in strict mode (produces verification). */
    strictMode(): this;
    /** @internal */
    addTransition(t: Transition<S>): void;
    build(): FlowDefinition<S>;
    /** Build without throwing. Returns definition (if valid) + structured errors. */
    buildAndValidate(): {
        definition: FlowDefinition<S> | null;
        errors: ValidationError[];
    };
    private buildInternal;
    private finalize;
    private collectErrors;
    private validate;
    private checkReachability;
    private checkPathToTerminal;
    private canReachTerminal;
    private checkDag;
    private hasCycle;
    private checkBranchCompleteness;
    private checkRequiresProduces;
    private checkRequiresProducesFrom;
    private checkAutoExternalConflict;
    private checkTerminalNoOutgoing;
    private checkSubFlowNestingDepth;
    private checkSubFlowCircularRef;
    private checkSubFlowExitCompleteness;
}
export declare class FromBuilder<S extends string> {
    private readonly builder;
    private readonly fromState;
    constructor(builder: Builder<S>, fromState: S);
    auto(to: S, processor: StateProcessor<S>): Builder<S>;
    external(to: S, guard: TransitionGuard<S>, processorOrOptions?: StateProcessor<S> | {
        processor?: StateProcessor<S>;
        timeout?: number;
    }): Builder<S>;
    branch(branch: BranchProcessor<S>): BranchBuilder<S>;
    subFlow(subFlowDef: FlowDefinition<any>): SubFlowBuilder<S>;
}
export declare class SubFlowBuilder<S extends string> {
    private readonly builder;
    private readonly fromState;
    private readonly subFlowDef;
    private readonly exitMap;
    constructor(builder: Builder<S>, fromState: S, subFlowDef: FlowDefinition<any>);
    onExit(terminalName: string, parentState: S): this;
    endSubFlow(): Builder<S>;
}
export declare class BranchBuilder<S extends string> {
    private readonly builder;
    private readonly fromState;
    private readonly branch;
    private readonly targets;
    private readonly processors;
    constructor(builder: Builder<S>, fromState: S, branch: BranchProcessor<S>);
    to(state: S, label: string, processor?: StateProcessor<S>): this;
    endBranch(): Builder<S>;
}
