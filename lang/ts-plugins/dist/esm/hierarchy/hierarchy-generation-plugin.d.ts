import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { HierarchicalFlowSpec } from './types.js';
export declare class HierarchyGenerationPlugin implements GenerationPlugin<HierarchicalFlowSpec, Map<string, string>> {
    private readonly generator;
    descriptor(): PluginDescriptor;
    kind(): "GENERATION";
    generate(input: HierarchicalFlowSpec): Map<string, string>;
}
