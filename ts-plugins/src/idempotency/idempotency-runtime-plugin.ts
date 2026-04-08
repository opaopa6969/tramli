import type { FlowEngine } from '@unlaxer/tramli';
import type { RuntimeAdapterPlugin, PluginDescriptor } from '../api/types.js';
import type { IdempotencyRegistry } from './types.js';
import { IdempotentRichResumeExecutor } from './idempotent-rich-resume-executor.js';

export class IdempotencyRuntimePlugin implements RuntimeAdapterPlugin<IdempotentRichResumeExecutor> {
  constructor(private readonly registry: IdempotencyRegistry) {}

  descriptor(): PluginDescriptor {
    return {
      id: 'idempotency',
      displayName: 'Idempotency',
      description: 'Binds a FlowEngine to duplicate-suppression helpers.',
    };
  }
  kind() { return 'RUNTIME_ADAPTER' as const; }

  bind(engine: FlowEngine): IdempotentRichResumeExecutor {
    return new IdempotentRichResumeExecutor(engine, this.registry);
  }
}
