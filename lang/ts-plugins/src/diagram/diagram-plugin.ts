import type { FlowDefinition } from '@unlaxer/tramli';
import { MermaidGenerator } from '@unlaxer/tramli';
import type { DiagramBundle } from './types.js';

export class DiagramPlugin {
  generate<S extends string>(definition: FlowDefinition<S>): DiagramBundle {
    const mermaid = MermaidGenerator.generate(definition);
    const json = definition.dataFlowGraph?.toJson() ?? '{}';
    const md =
      `# ${definition.name}\n\n` +
      `- initial: \`${definition.initialState}\`\n` +
      `- states: \`${definition.allStates().length}\`\n` +
      `- transitions: \`${definition.transitions.length}\`\n`;
    return { mermaid, dataFlowJson: json, markdownSummary: md };
  }
}
