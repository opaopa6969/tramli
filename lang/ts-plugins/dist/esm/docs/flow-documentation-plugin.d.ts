import type { FlowDefinition } from '@unlaxer/tramli';
import type { DocumentationPlugin as DocPluginSPI, PluginDescriptor } from '../api/types.js';
export declare class FlowDocumentationPlugin<S extends string> implements DocPluginSPI<FlowDefinition<S>> {
    private readonly delegate;
    descriptor(): PluginDescriptor;
    kind(): "DOCUMENTATION";
    generate(input: FlowDefinition<S>): string;
}
