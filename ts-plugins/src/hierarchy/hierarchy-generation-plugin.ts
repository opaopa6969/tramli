import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { HierarchicalFlowSpec } from './types.js';
import { HierarchyCodeGenerator } from './hierarchy-code-generator.js';

export class HierarchyGenerationPlugin implements GenerationPlugin<HierarchicalFlowSpec, Map<string, string>> {
  private readonly generator = new HierarchyCodeGenerator();

  descriptor(): PluginDescriptor {
    return {
      id: 'hierarchy',
      displayName: 'Hierarchy Generator',
      description: 'Compiles hierarchical authoring specs into flat TypeScript state config and builder skeleton.',
    };
  }
  kind() { return 'GENERATION' as const; }

  generate(input: HierarchicalFlowSpec): Map<string, string> {
    return new Map([
      [`${input.enumName}.ts`, this.generator.generateStateConfig(input)],
      [`${input.flowName}Generated.ts`, this.generator.generateBuilderSkeleton(input)],
    ]);
  }
}
