import type { FlowKey } from './flow-key.js';
import type { StateConfig, Transition, StateProcessor, TransitionGuard, BranchProcessor } from './types.js';
import { DataFlowGraph } from './data-flow-graph.js';
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
    private constructor();
    transitionsFrom(state: S): Transition<S>[];
    externalFrom(state: S): Transition<S> | undefined;
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
    private readonly initiallyAvailableKeys;
    constructor(name: string, stateConfig: Record<S, StateConfig>);
    initiallyAvailable(...keys: FlowKey<unknown>[]): this;
    setTtl(ms: number): this;
    setMaxGuardRetries(max: number): this;
    from(state: S): FromBuilder<S>;
    onError(from: S, to: S): this;
    onAnyError(errorState: S): this;
    /** @internal */
    addTransition(t: Transition<S>): void;
    build(): FlowDefinition<S>;
    private validate;
    private checkReachability;
    private checkPathToTerminal;
    private canReachTerminal;
    private checkDag;
    private hasCycle;
    private checkExternalUniqueness;
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
    external(to: S, guard: TransitionGuard<S>, processor?: StateProcessor<S>): Builder<S>;
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
