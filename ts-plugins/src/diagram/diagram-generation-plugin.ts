import type { FlowDefinition } from '@unlaxer/tramli';
import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { DiagramBundle } from './types.js';
import { DiagramPlugin } from './diagram-plugin.js';

export class DiagramGenerationPlugin<S extends string> implements GenerationPlugin<FlowDefinition<S>, DiagramBundle> {
  private readonly delegate = new DiagramPlugin();

  descriptor(): PluginDescriptor {
    return {
      id: 'diagram',
      displayName: 'Diagram Generator',
      description: 'Generates Mermaid and data-flow bundles from a flow definition.',
    };
  }
  kind() { return 'GENERATION' as const; }

  generate(input: FlowDefinition<S>): DiagramBundle {
    return this.delegate.generate(input);
  }
}
