"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuaranteedSubflowValidator = void 0;
/**
 * Validates that a subflow's entry requirements are satisfied
 * by the parent flow's available data at a given state plus any guaranteed types.
 */
class GuaranteedSubflowValidator {
    validate(parent, parentState, subflow, guaranteedTypes) {
        if (!parent.dataFlowGraph || !subflow.dataFlowGraph) {
            throw new Error('DataFlowGraph is required for subflow validation');
        }
        const available = new Set(parent.dataFlowGraph.availableAt(parentState));
        for (const t of guaranteedTypes)
            available.add(t);
        const initialState = subflow.initialState;
        if (initialState == null) {
            throw new Error(`Subflow ${subflow.name} has no initial state`);
        }
        const requiredAtEntry = subflow.dataFlowGraph.availableAt(initialState);
        const missing = [];
        for (const req of requiredAtEntry) {
            if (!available.has(req))
                missing.push(req);
        }
        if (missing.length > 0) {
            throw new Error(`Subflow ${subflow.name} is missing guaranteed types at entry: [${missing.join(', ')}]`);
        }
    }
}
exports.GuaranteedSubflowValidator = GuaranteedSubflowValidator;
