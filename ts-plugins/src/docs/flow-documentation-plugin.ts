import type { FlowDefinition } from '@unlaxer/tramli';
import type { DocumentationPlugin as DocPluginSPI, PluginDescriptor } from '../api/types.js';
import { DocumentationPlugin } from './documentation-plugin.js';

export class FlowDocumentationPlugin<S extends string> implements DocPluginSPI<FlowDefinition<S>> {
  private readonly delegate = new DocumentationPlugin();

  descriptor(): PluginDescriptor {
    return {
      id: 'docs',
      displayName: 'Documentation Generator',
      description: 'Renders a markdown flow catalog from a flow definition.',
    };
  }
  kind() { return 'DOCUMENTATION' as const; }

  generate(input: FlowDefinition<S>): string {
    return this.delegate.toMarkdown(input);
  }
}
