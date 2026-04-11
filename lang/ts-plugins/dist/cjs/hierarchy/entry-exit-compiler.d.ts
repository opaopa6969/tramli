import type { HierarchicalFlowSpec, HierarchicalTransitionSpec } from './types.js';
/**
 * Synthesizes entry/exit transitions from hierarchical state specs.
 */
export declare class EntryExitCompiler {
    synthesize(spec: HierarchicalFlowSpec): HierarchicalTransitionSpec[];
    private walk;
}
