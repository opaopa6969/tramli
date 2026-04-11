"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagramPlugin = void 0;
const tramli_1 = require("@unlaxer/tramli");
class DiagramPlugin {
    generate(definition) {
        const mermaid = tramli_1.MermaidGenerator.generate(definition);
        const json = definition.dataFlowGraph?.toJson() ?? '{}';
        const md = `# ${definition.name}\n\n` +
            `- initial: \`${definition.initialState}\`\n` +
            `- states: \`${definition.allStates().length}\`\n` +
            `- transitions: \`${definition.transitions.length}\`\n`;
        return { mermaid, dataFlowJson: json, markdownSummary: md };
    }
}
exports.DiagramPlugin = DiagramPlugin;
