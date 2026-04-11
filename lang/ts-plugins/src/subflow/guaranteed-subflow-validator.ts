import type { FlowDefinition } from '@unlaxer/tramli';

/**
 * Validates that a subflow's entry requirements are satisfied
 * by the parent flow's available data at a given state plus any guaranteed types.
 */
export class GuaranteedSubflowValidator {
  validate<S extends string, T extends string>(
    parent: FlowDefinition<S>,
    parentState: S,
    subflow: FlowDefinition<T>,
    guaranteedTypes: Set<string>,
  ): void {
    if (!parent.dataFlowGraph || !subflow.dataFlowGraph) {
      throw new Error('DataFlowGraph is required for subflow validation');
    }
    const available = new Set<string>(parent.dataFlowGraph.availableAt(parentState));
    for (const t of guaranteedTypes) available.add(t);

    const initialState = subflow.initialState;
    if (initialState == null) {
      throw new Error(`Subflow ${subflow.name} has no initial state`);
    }
    const requiredAtEntry = subflow.dataFlowGraph.availableAt(initialState);
    const missing: string[] = [];
    for (const req of requiredAtEntry) {
      if (!available.has(req)) missing.push(req);
    }
    if (missing.length > 0) {
      throw new Error(
        `Subflow ${subflow.name} is missing guaranteed types at entry: [${missing.join(', ')}]`,
      );
    }
  }
}
