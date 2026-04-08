import type { FlowDefinition } from '@unlaxer/tramli';
import type { FlowScenario, FlowTestPlan } from './types.js';

/**
 * Generates BDD-style test scenarios from a flow definition.
 */
export class ScenarioTestPlugin {
  generate<S extends string>(definition: FlowDefinition<S>): FlowTestPlan {
    const scenarios: FlowScenario[] = [];
    for (const t of definition.transitions) {
      const steps: string[] = [];
      steps.push(`given flow in ${t.from}`);
      if (t.type === 'external' && t.guard) {
        steps.push(`when external data satisfies guard ${t.guard.name}`);
      }
      if (t.type === 'auto' && t.processor) {
        steps.push(`when auto processor ${t.processor.name} runs`);
      }
      if (t.type === 'branch' && t.branch) {
        steps.push(`when branch ${t.branch.name} selects a route`);
      }
      steps.push(`then flow reaches ${t.to}`);
      scenarios.push({ name: `${t.from}_to_${t.to}`, steps });
    }
    return { scenarios };
  }
}
