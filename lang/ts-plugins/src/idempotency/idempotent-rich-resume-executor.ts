import type { FlowEngine, FlowDefinition } from '@unlaxer/tramli';
import type { IdempotencyRegistry, CommandEnvelope } from './types.js';
import { RichResumeExecutor, type RichResumeResult } from '../resume/rich-resume.js';

export class IdempotentRichResumeExecutor {
  private readonly registry: IdempotencyRegistry;
  private readonly delegate: RichResumeExecutor;

  constructor(engine: FlowEngine, registry: IdempotencyRegistry) {
    this.registry = registry;
    this.delegate = new RichResumeExecutor(engine);
  }

  async resume<S extends string>(
    flowId: string,
    definition: FlowDefinition<S>,
    envelope: CommandEnvelope,
    knownBeforeState: S,
  ): Promise<RichResumeResult<S>> {
    if (!this.registry.markIfFirstSeen(flowId, envelope.commandId)) {
      return {
        status: 'ALREADY_COMPLETE',
        error: new Error(`duplicate commandId ${envelope.commandId}`),
      };
    }
    return this.delegate.resume(flowId, definition, envelope.externalData, knownBeforeState);
  }
}
