import { MermaidGenerator } from '@unlaxer/tramli';
export class DiagramPlugin {
    generate(definition) {
        const mermaid = MermaidGenerator.generate(definition);
        const json = definition.dataFlowGraph?.toJson() ?? '{}';
        const md = `# ${definition.name}\n\n` +
            `- initial: \`${definition.initialState}\`\n` +
            `- states: \`${definition.allStates().length}\`\n` +
            `- transitions: \`${definition.transitions.length}\`\n`;
        return { mermaid, dataFlowJson: json, markdownSummary: md };
    }
}
