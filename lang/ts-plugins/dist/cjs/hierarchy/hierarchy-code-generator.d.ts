import type { HierarchicalFlowSpec } from './types.js';
/**
 * Generates TypeScript source from a hierarchical flow spec.
 * Flattens the hierarchy into a flat state config + builder skeleton.
 */
export declare class HierarchyCodeGenerator {
    generateStateConfig(spec: HierarchicalFlowSpec): string;
    generateBuilderSkeleton(spec: HierarchicalFlowSpec): string;
    private flatten;
}
