import type { FlowEngine, FlowDefinition } from '@unlaxer/tramli';
import type { IdempotencyRegistry, CommandEnvelope } from './types.js';
import { type RichResumeResult } from '../resume/rich-resume.js';
export declare class IdempotentRichResumeExecutor {
    private readonly registry;
    private readonly delegate;
    constructor(engine: FlowEngine, registry: IdempotencyRegistry);
    resume<S extends string>(flowId: string, definition: FlowDefinition<S>, envelope: CommandEnvelope, knownBeforeState: S): Promise<RichResumeResult<S>>;
}
