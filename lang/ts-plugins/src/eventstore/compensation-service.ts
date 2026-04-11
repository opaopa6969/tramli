import type { VersionedTransitionEvent, CompensationResolver } from './types.js';
import type { EventLogStoreDecorator } from './event-log-store-decorator.js';

/**
 * Compensation service — records compensation events for failed transitions.
 */
export class CompensationService {
  constructor(
    private readonly resolver: CompensationResolver,
    private readonly eventLog: EventLogStoreDecorator,
  ) {}

  compensate(event: VersionedTransitionEvent, cause: Error): boolean {
    const plan = this.resolver(event, cause);
    if (!plan) return false;
    this.eventLog.appendCompensation(
      event.flowId, plan.action,
      JSON.stringify(plan.metadata),
    );
    return true;
  }
}
