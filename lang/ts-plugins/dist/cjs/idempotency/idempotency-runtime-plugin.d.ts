import type { FlowEngine } from '@unlaxer/tramli';
import type { RuntimeAdapterPlugin, PluginDescriptor } from '../api/types.js';
import type { IdempotencyRegistry } from './types.js';
import { IdempotentRichResumeExecutor } from './idempotent-rich-resume-executor.js';
export declare class IdempotencyRuntimePlugin implements RuntimeAdapterPlugin<IdempotentRichResumeExecutor> {
    private readonly registry;
    constructor(registry: IdempotencyRegistry);
    descriptor(): PluginDescriptor;
    kind(): "RUNTIME_ADAPTER";
    bind(engine: FlowEngine): IdempotentRichResumeExecutor;
}
