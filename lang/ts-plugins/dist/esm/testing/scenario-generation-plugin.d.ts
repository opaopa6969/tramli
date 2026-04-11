import type { FlowDefinition } from '@unlaxer/tramli';
import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { FlowTestPlan } from './types.js';
export declare class ScenarioGenerationPlugin<S extends string> implements GenerationPlugin<FlowDefinition<S>, FlowTestPlan> {
    private readonly delegate;
    descriptor(): PluginDescriptor;
    kind(): "GENERATION";
    generate(input: FlowDefinition<S>): FlowTestPlan;
}
