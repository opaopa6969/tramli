"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HierarchyGenerationPlugin = void 0;
const hierarchy_code_generator_js_1 = require("./hierarchy-code-generator.js");
class HierarchyGenerationPlugin {
    generator = new hierarchy_code_generator_js_1.HierarchyCodeGenerator();
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
exports.HierarchyGenerationPlugin = HierarchyGenerationPlugin;
