"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RichResumeRuntimePlugin = exports.RichResumeExecutor = void 0;
/**
 * Enhanced resumeAndExecute with explicit status classification.
 */
class RichResumeExecutor {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    async resume(flowId, definition, externalData, previousState) {
        try {
            const flow = await this.engine.resumeAndExecute(flowId, definition, externalData);
            if (flow.isCompleted && flow.currentState === previousState) {
                return { status: 'ALREADY_COMPLETE', flow };
            }
            if (flow.currentState === previousState && !flow.isCompleted) {
                return { status: 'REJECTED', flow };
            }
            return { status: 'TRANSITIONED', flow };
        }
        catch (e) {
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
exports.RichResumeExecutor = RichResumeExecutor;
class RichResumeRuntimePlugin {
    descriptor() {
        return { id: 'rich-resume', displayName: 'Rich Resume', description: 'Enhanced resume with status classification' };
    }
    kind() { return 'RUNTIME_ADAPTER'; }
    bind(engine) {
        return new RichResumeExecutor(engine);
    }
}
exports.RichResumeRuntimePlugin = RichResumeRuntimePlugin;
