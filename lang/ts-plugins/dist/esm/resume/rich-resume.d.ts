import type { FlowEngine, FlowDefinition, FlowInstance } from '@unlaxer/tramli';
import type { RuntimeAdapterPlugin, PluginDescriptor } from '../api/types.js';
export type RichResumeStatus = 'TRANSITIONED' | 'ALREADY_COMPLETE' | 'NO_APPLICABLE_TRANSITION' | 'REJECTED' | 'EXCEPTION_ROUTED';
export interface RichResumeResult<S extends string> {
    status: RichResumeStatus;
    flow?: FlowInstance<S>;
    error?: Error;
}
/**
 * Enhanced resumeAndExecute with explicit status classification.
 */
export declare class RichResumeExecutor {
    private readonly engine;
    constructor(engine: FlowEngine);
    resume<S extends string>(flowId: string, definition: FlowDefinition<S>, externalData: Map<string, unknown>, previousState: S): Promise<RichResumeResult<S>>;
}
export declare class RichResumeRuntimePlugin implements RuntimeAdapterPlugin<RichResumeExecutor> {
    descriptor(): PluginDescriptor;
    kind(): "RUNTIME_ADAPTER";
    bind(engine: FlowEngine): RichResumeExecutor;
}
