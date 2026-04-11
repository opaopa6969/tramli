/**
 * Compensation service — records compensation events for failed transitions.
 */
export class CompensationService {
    resolver;
    eventLog;
    constructor(resolver, eventLog) {
        this.resolver = resolver;
        this.eventLog = eventLog;
    }
    compensate(event, cause) {
        const plan = this.resolver(event, cause);
        if (!plan)
            return false;
        this.eventLog.appendCompensation(event.flowId, plan.action, JSON.stringify(plan.metadata));
        return true;
    }
}
