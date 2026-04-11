import type { FlowDefinition } from '@unlaxer/tramli';
import type { GenerationPlugin, PluginDescriptor } from '../api/types.js';
import type { FlowTestPlan } from './types.js';
import { ScenarioTestPlugin } from './scenario-test-plugin.js';

export class ScenarioGenerationPlugin<S extends string> implements GenerationPlugin<FlowDefinition<S>, FlowTestPlan> {
  private readonly delegate = new ScenarioTestPlugin();

  descriptor(): PluginDescriptor {
    return {
      id: 'scenario-tests',
      displayName: 'Scenario Test Generator',
      description: 'Produces scenario-oriented test plans from a flow definition.',
    };
  }
  kind() { return 'GENERATION' as const; }

  generate(input: FlowDefinition<S>): FlowTestPlan {
    return this.delegate.generate(input);
  }
}
