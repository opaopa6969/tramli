"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyRuntimePlugin = void 0;
const idempotent_rich_resume_executor_js_1 = require("./idempotent-rich-resume-executor.js");
class IdempotencyRuntimePlugin {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    descriptor() {
        return {
            id: 'idempotency',
            displayName: 'Idempotency',
            description: 'Binds a FlowEngine to duplicate-suppression helpers.',
        };
    }
    kind() { return 'RUNTIME_ADAPTER'; }
    bind(engine) {
        return new idempotent_rich_resume_executor_js_1.IdempotentRichResumeExecutor(engine, this.registry);
    }
}
exports.IdempotencyRuntimePlugin = IdempotencyRuntimePlugin;
