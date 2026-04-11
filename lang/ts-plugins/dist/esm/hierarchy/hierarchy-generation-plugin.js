import { HierarchyCodeGenerator } from './hierarchy-code-generator.js';
export class HierarchyGenerationPlugin {
    generator = new HierarchyCodeGenerator();
    descriptor() {
        return {
            id: 'hierarchy',
            displayName: 'Hierarchy Generator',
            description: 'Compiles hierarchical authoring specs into flat TypeScript state config and builder skeleton.',
        };
    }
    kind() { return 'GENERATION'; }
    generate(input) {
        return new Map([
            [`${input.enumName}.ts`, this.generator.generateStateConfig(input)],
            [`${input.flowName}Generated.ts`, this.generator.generateBuilderSkeleton(input)],
        ]);
    }
}
