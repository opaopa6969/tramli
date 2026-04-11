import { RichResumeExecutor } from '../resume/rich-resume.js';
export class IdempotentRichResumeExecutor {
    registry;
    delegate;
    constructor(engine, registry) {
        this.registry = registry;
        this.delegate = new RichResumeExecutor(engine);
    }
    async resume(flowId, definition, envelope, knownBeforeState) {
        if (!this.registry.markIfFirstSeen(flowId, envelope.commandId)) {
            return {
                status: 'ALREADY_COMPLETE',
                error: new Error(`duplicate commandId ${envelope.commandId}`),
            };
        }
        return this.delegate.resume(flowId, definition, envelope.externalData, knownBeforeState);
    }
}
