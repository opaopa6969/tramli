import type { FlowDefinition } from '@unlaxer/tramli';
import type { FlowScenario, FlowTestPlan } from './types.js';

/**
 * Generates BDD-style test scenarios from a flow definition.
 * Covers happy paths, error transitions, guard rejections, and timeout expiry.
 */
export class ScenarioTestPlugin {
  generate<S extends string>(definition: FlowDefinition<S>): FlowTestPlan {
    const scenarios: FlowScenario[] = [];

    // Happy path scenarios from transitions
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
      scenarios.push({ name: `${t.from}_to_${t.to}`, kind: 'happy', steps });
    }

    // Error path scenarios from errorTransitions
    for (const [from, to] of definition.errorTransitions) {
      scenarios.push({
        name: `error_${from}_to_${to}`,
        kind: 'error',
        steps: [
          `given flow in ${from}`,
          `when processor throws an error`,
          `then flow transitions to ${to} via on_error`,
        ],
      });
    }

    // Exception route scenarios
    if (definition.exceptionRoutes) {
      for (const [from, routes] of definition.exceptionRoutes) {
        for (const route of routes) {
          const label = route.errorClass?.name ?? 'error';
          scenarios.push({
            name: `step_error_${from}_${label}_to_${route.target}`,
            kind: 'error',
            steps: [
              `given flow in ${from}`,
              `when error matching ${label} is thrown`,
              `then flow transitions to ${route.target} via on_step_error`,
            ],
          });
        }
      }
    }

    // Guard rejection scenarios
    for (const t of definition.transitions) {
      if (t.type === 'external' && t.guard) {
        const errorTarget = definition.errorTransitions.get(t.from);
        scenarios.push({
          name: `guard_reject_${t.from}_${t.guard.name}`,
          kind: 'guard_rejection',
          steps: [
            `given flow in ${t.from}`,
            `when guard ${t.guard.name} rejects ${definition.maxGuardRetries} times`,
            errorTarget
              ? `then flow transitions to ${errorTarget} via error`
              : `then flow enters TERMINAL_ERROR`,
          ],
        });
      }
    }

    // Timeout scenarios
    for (const t of definition.transitions) {
      if (t.timeout != null) {
        scenarios.push({
          name: `timeout_${t.from}`,
          kind: 'timeout',
          steps: [
            `given flow in ${t.from}`,
            `when per-state timeout of ${t.timeout}ms expires`,
            `then flow completes as EXPIRED`,
          ],
        });
      }
    }

    return { scenarios };
  }
}
