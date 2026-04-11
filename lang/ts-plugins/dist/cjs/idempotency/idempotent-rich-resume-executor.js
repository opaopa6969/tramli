"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotentRichResumeExecutor = void 0;
const rich_resume_js_1 = require("../resume/rich-resume.js");
class IdempotentRichResumeExecutor {
    registry;
    delegate;
    constructor(engine, registry) {
        this.registry = registry;
        this.delegate = new rich_resume_js_1.RichResumeExecutor(engine);
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
exports.IdempotentRichResumeExecutor = IdempotentRichResumeExecutor;
