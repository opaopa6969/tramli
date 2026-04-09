import type { FlowDefinition } from '@unlaxer/tramli';
import type { FlowScenario, FlowTestPlan } from './types.js';

export type TestFramework = 'vitest' | 'jest';

/**
 * Generates BDD-style test scenarios from a flow definition.
 * Covers happy paths, error transitions, guard rejections, and timeout expiry.
 */
export class ScenarioTestPlugin {
  /**
   * Generate executable test code from a flow definition.
   * Produces a string of vitest/jest test code that validates transitions
   * against the definition's structure (no FlowEngine required).
   */
  generateCode<S extends string>(definition: FlowDefinition<S>, framework: TestFramework = 'vitest'): string {
    const plan = this.generate(definition);
    const lines: string[] = [];
    const imp = framework === 'vitest' ? "import { describe, it, expect } from 'vitest';" : '';
    if (imp) lines.push(imp);
    lines.push('');
    lines.push(`describe('${definition.name} scenarios', () => {`);

    for (const scenario of plan.scenarios) {
      lines.push(`  it('${scenario.name}', () => {`);
      for (const step of scenario.steps) {
        lines.push(`    // ${step}`);
      }
      // Add assertion based on scenario kind
      switch (scenario.kind) {
        case 'happy': {
          const fromMatch = scenario.steps[0]?.match(/given flow in (\S+)/);
          const toMatch = scenario.steps[scenario.steps.length - 1]?.match(/then flow reaches (\S+)/);
          if (fromMatch && toMatch) {
            const from = fromMatch[1];
            const to = toMatch[1];
            lines.push(`    const transitions = definition.transitionsFrom('${from}');`);
            lines.push(`    expect(transitions.some(t => t.to === '${to}')).toBe(true);`);
          }
          break;
        }
        case 'error': {
          const fromMatch = scenario.steps[0]?.match(/given flow in (\S+)/);
          const toMatch = scenario.steps[scenario.steps.length - 1]?.match(/then flow transitions to (\S+)/);
          if (fromMatch && toMatch) {
            lines.push(`    expect(definition.errorTransitions.get('${fromMatch[1]}')).toBe('${toMatch[1]}');`);
          }
          break;
        }
        case 'guard_rejection': {
          const guardMatch = scenario.steps[1]?.match(/when guard (\S+) rejects/);
          if (guardMatch) {
            lines.push(`    expect(definition.maxGuardRetries).toBeGreaterThan(0);`);
          }
          break;
        }
        case 'timeout': {
          const fromMatch = scenario.steps[0]?.match(/given flow in (\S+)/);
          if (fromMatch) {
            lines.push(`    const t = definition.transitionsFrom('${fromMatch[1]}').find(t => t.timeout != null);`);
            lines.push(`    expect(t).toBeDefined();`);
          }
          break;
        }
      }
      lines.push('  });');
      lines.push('');
    }

    lines.push('});');
    lines.push('');
    return lines.join('\n');
  }

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
