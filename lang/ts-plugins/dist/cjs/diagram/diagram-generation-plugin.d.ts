import type { FlowDefinition } from '@unlaxer/tramli';
import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { DiagramBundle } from './types.js';
export declare class DiagramGenerationPlugin<S extends string> implements GenerationPlugin<FlowDefinition<S>, DiagramBundle> {
    private readonly delegate;
    descriptor(): PluginDescriptor;
    kind(): "GENERATION";
    generate(input: FlowDefinition<S>): DiagramBundle;
}
