/**
 * FlowStore decorator that maintains an append-only event log.
 * Tenure-lite: not full event sourcing, intentionally lighter.
 */
export class EventLogStoreDecorator {
    delegate;
    eventLog = [];
    versionCounters = new Map();
    constructor(delegate) {
        this.delegate = delegate;
    }
    create(flow) { this.delegate.create(flow); }
    loadForUpdate(flowId, definition) {
        return this.delegate.loadForUpdate(flowId, definition);
    }
    save(flow) { this.delegate.save(flow); }
    recordTransition(flowId, from, to, trigger, ctx) {
        this.delegate.recordTransition(flowId, from, to, trigger, ctx);
        const version = (this.versionCounters.get(flowId) ?? 0) + 1;
        this.versionCounters.set(flowId, version);
        this.eventLog.push({
            flowId, version, type: 'TRANSITION',
            from: from?.toString() ?? null, to, trigger,
            timestamp: new Date(),
            stateSnapshot: JSON.stringify(Object.fromEntries(ctx.snapshot())),
        });
    }
    /** All events across all flows. */
    events() { return this.eventLog; }
    /** Events for a specific flow. */
    eventsForFlow(flowId) {
        return this.eventLog.filter(e => e.flowId === flowId);
    }
    /** Append a compensation event. */
    appendCompensation(flowId, trigger, metadata) {
        const version = (this.versionCounters.get(flowId) ?? 0) + 1;
        this.versionCounters.set(flowId, version);
        this.eventLog.push({
            flowId, version, type: 'COMPENSATION',
            from: null, to: 'COMPENSATED', trigger,
            timestamp: new Date(), stateSnapshot: metadata,
        });
    }
    get transitionLog() { return this.delegate.transitionLog; }
    clear() { this.delegate.clear?.(); this.eventLog = []; this.versionCounters.clear(); }
}
