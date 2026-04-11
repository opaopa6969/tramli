"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompensationService = void 0;
/**
 * Compensation service — records compensation events for failed transitions.
 */
class CompensationService {
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
exports.CompensationService = CompensationService;
