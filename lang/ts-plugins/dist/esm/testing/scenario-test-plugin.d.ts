import type { FlowDefinition } from '@unlaxer/tramli';
import type { FlowTestPlan } from './types.js';
export type TestFramework = 'vitest' | 'jest';
/**
 * Generates BDD-style test scenarios from a flow definition.
 * Covers happy paths, error transitions, guard rejections, and timeout expiry.
 */
export declare class ScenarioTestPlugin {
    /**
     * Generate executable test code from a flow definition.
     * Produces a string of vitest/jest test code that validates transitions
     * against the definition's structure (no FlowEngine required).
     */
    generateCode<S extends string>(definition: FlowDefinition<S>, framework?: TestFramework): string;
    generate<S extends string>(definition: FlowDefinition<S>): FlowTestPlan;
}
