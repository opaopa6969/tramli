import type { FlowEngine, FlowDefinition, FlowInstance, FlowError } from '@unlaxer/tramli';
import type { RuntimeAdapterPlugin, PluginDescriptor } from '../api/types.js';

export type RichResumeStatus =
  | 'TRANSITIONED'
  | 'ALREADY_COMPLETE'
  | 'NO_APPLICABLE_TRANSITION'
  | 'REJECTED'
  | 'EXCEPTION_ROUTED';

export interface RichResumeResult<S extends string> {
  status: RichResumeStatus;
  flow?: FlowInstance<S>;
  error?: Error;
}

/**
 * Enhanced resumeAndExecute with explicit status classification.
 */
export class RichResumeExecutor {
  constructor(private readonly engine: FlowEngine) {}

  async resume<S extends string>(
    flowId: string,
    definition: FlowDefinition<S>,
    externalData: Map<string, unknown>,
    previousState: S,
  ): Promise<RichResumeResult<S>> {
    try {
      const flow = await this.engine.resumeAndExecute(flowId, definition, externalData);
      if (flow.isCompleted && flow.currentState === previousState) {
        return { status: 'ALREADY_COMPLETE', flow };
      }
      if (flow.currentState === previousState && !flow.isCompleted) {
        return { status: 'REJECTED', flow };
      }
      return { status: 'TRANSITIONED', flow };
    } catch (e: any) {
      if (e.code === 'FLOW_ALREADY_COMPLETED') {
        return { status: 'ALREADY_COMPLETE', error: e };
      }
      if (e.code === 'FLOW_NOT_FOUND') {
        return { status: 'NO_APPLICABLE_TRANSITION', error: e };
      }
      if (e.code === 'INVALID_TRANSITION') {
        return { status: 'NO_APPLICABLE_TRANSITION', error: e };
      }
      return { status: 'EXCEPTION_ROUTED', error: e };
    }
  }
}

export class RichResumeRuntimePlugin implements RuntimeAdapterPlugin<RichResumeExecutor> {
  descriptor(): PluginDescriptor {
    return { id: 'rich-resume', displayName: 'Rich Resume', description: 'Enhanced resume with status classification' };
  }
  kind() { return 'RUNTIME_ADAPTER' as const; }

  bind(engine: FlowEngine): RichResumeExecutor {
    return new RichResumeExecutor(engine);
  }
}
