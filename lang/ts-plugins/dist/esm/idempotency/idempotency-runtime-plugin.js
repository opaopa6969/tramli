import { IdempotentRichResumeExecutor } from './idempotent-rich-resume-executor.js';
export class IdempotencyRuntimePlugin {
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
        return new IdempotentRichResumeExecutor(engine, this.registry);
    }
}
