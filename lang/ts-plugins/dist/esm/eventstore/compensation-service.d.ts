import type { VersionedTransitionEvent, CompensationResolver } from './types.js';
import type { EventLogStoreDecorator } from './event-log-store-decorator.js';
/**
 * Compensation service — records compensation events for failed transitions.
 */
export declare class CompensationService {
    private readonly resolver;
    private readonly eventLog;
    constructor(resolver: CompensationResolver, eventLog: EventLogStoreDecorator);
    compensate(event: VersionedTransitionEvent, cause: Error): boolean;
}
