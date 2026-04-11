import type { FlowDefinition } from '@unlaxer/tramli';
/**
 * Validates that a subflow's entry requirements are satisfied
 * by the parent flow's available data at a given state plus any guaranteed types.
 */
export declare class GuaranteedSubflowValidator {
    validate<S extends string, T extends string>(parent: FlowDefinition<S>, parentState: S, subflow: FlowDefinition<T>, guaranteedTypes: Set<string>): void;
}
