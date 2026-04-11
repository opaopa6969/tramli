import type { FlowDefinition } from './flow-definition.js';
import type { FlowKey } from './flow-key.js';
import type { StateProcessor } from './types.js';
import type { FlowContext } from './flow-context.js';
export interface NodeInfo<S extends string> {
    name: string;
    fromState: S;
    toState: S;
    kind: 'processor' | 'guard' | 'branch' | 'initial';
}
/**
 * Bipartite graph of data types (FlowKey) and processors/guards.
 * Built automatically during FlowDefinition.build().
 */
export declare class DataFlowGraph<S extends string> {
    private readonly _availableAtState;
    private readonly _producers;
    private readonly _consumers;
    private readonly _allProduced;
    private readonly _allConsumed;
    private constructor();
    /** Data types available in context when the flow reaches the given state. */
    availableAt(state: S): Set<string>;
    /** Processors/guards that produce the given type. */
    producersOf(key: FlowKey<unknown>): NodeInfo<S>[];
    /** Processors/guards that consume (require) the given type. */
    consumersOf(key: FlowKey<unknown>): NodeInfo<S>[];
    /** Types produced but never required by any downstream processor/guard. */
    deadData(): Set<string>;
    /** Data lifetime: which states a type is first produced and last consumed. */
    lifetime(key: FlowKey<unknown>): {
        firstProduced: S;
        lastConsumed: S;
    } | null;
    /** Context pruning hints: for each state, types available but not required at that state. */
    pruningHints(): Map<S, Set<string>>;
    /**
     * Check if processor B can replace processor A without breaking data-flow.
     * B is compatible with A if: B requires no more than A, and B produces at least what A produces.
     */
    static isCompatible<S extends string>(a: {
        requires: FlowKey<unknown>[];
        produces: FlowKey<unknown>[];
    }, b: {
        requires: FlowKey<unknown>[];
        produces: FlowKey<unknown>[];
    }): boolean;
    /**
     * Verify a processor's declared requires/produces against actual context usage.
     * Returns list of violations (empty = OK).
     */
    static verifyProcessor<S extends string>(processor: StateProcessor<S>, ctx: FlowContext): Promise<string[]>;
    /** All type nodes in the graph. */
    allTypes(): Set<string>;
    /**
     * Assert that a flow instance's context satisfies the data-flow invariant.
     * Returns list of missing type keys (empty = OK).
     */
    assertDataFlow(ctx: FlowContext, currentState: S): string[];
    /** Impact analysis: all producers and consumers of a given type. */
    impactOf(key: FlowKey<unknown>): {
        producers: NodeInfo<S>[];
        consumers: NodeInfo<S>[];
    };
    /** Parallelism hints: pairs of processors with no data dependency. */
    parallelismHints(): [string, string][];
    /** Structured JSON representation. */
    toJson(): string;
    /** Generate Mermaid data-flow diagram. */
    toMermaid(): string;
    /** Recommended migration order: processors sorted by dependency (fewest first). */
    migrationOrder(): string[];
    /** Generate Markdown migration checklist. */
    toMarkdown(): string;
    /** Test scaffold: for each processor, list required type names. */
    testScaffold(): Map<string, string[]>;
    /** Generate data-flow invariant assertions as strings. */
    generateInvariantAssertions(): string[];
    /** Cross-flow map: types that one flow produces and another requires. */
    static crossFlowMap(...graphs: DataFlowGraph<any>[]): string[];
    /** Diff two data-flow graphs. */
    static diff(before: DataFlowGraph<any>, after: DataFlowGraph<any>): {
        addedTypes: Set<string>;
        removedTypes: Set<string>;
        addedEdges: Set<string>;
        removedEdges: Set<string>;
    };
    private static collectEdges;
    /** Version compatibility: check if v1 instances can resume on v2 definition. */
    static versionCompatibility<S extends string>(before: DataFlowGraph<S>, after: DataFlowGraph<S>): string[];
    static build<S extends string>(def: FlowDefinition<S>, initiallyAvailable: string[]): DataFlowGraph<S>;
}
