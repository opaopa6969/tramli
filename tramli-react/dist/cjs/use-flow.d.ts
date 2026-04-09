import { type FlowDefinition, type FlowContext } from '@unlaxer/tramli';
export interface UseFlowOptions {
    /** Initial data to seed the flow context. */
    initialData?: Map<string, unknown>;
    /** Session ID for the flow instance. Defaults to crypto.randomUUID(). */
    sessionId?: string;
}
export interface UseFlowResult<S extends string> {
    /** Current flow state, or null before the flow starts. */
    state: S | null;
    /** Flow context, or null before the flow starts. */
    context: FlowContext | null;
    /** Flow instance ID, or null before the flow starts. */
    flowId: string | null;
    /** Error from the last operation, or null. */
    error: Error | null;
    /** True while startFlow or resume is in progress. */
    isLoading: boolean;
    /** Resume the flow with optional external data. */
    resume: (externalData?: Map<string, unknown>) => Promise<void>;
}
/**
 * React hook that manages a tramli flow lifecycle.
 *
 * Creates a FlowEngine + InMemoryFlowStore once per mount,
 * starts the flow in useEffect, and exposes state/context/resume.
 */
export declare function useFlow<S extends string>(definition: FlowDefinition<S>, options?: UseFlowOptions): UseFlowResult<S>;
