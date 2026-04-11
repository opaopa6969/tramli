"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditingFlowStore = void 0;
/**
 * FlowStore decorator that captures produced-data snapshots on each transition.
 */
class AuditingFlowStore {
    delegate;
    auditLog = [];
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
        const snapshot = new Map();
        for (const [k, v] of ctx.snapshot()) {
            snapshot.set(k, v);
        }
        this.auditLog.push({
            flowId, from: from?.toString() ?? null, to, trigger,
            timestamp: new Date(), producedDataSnapshot: snapshot,
        });
    }
    get auditedTransitions() { return this.auditLog; }
    get transitionLog() { return this.delegate.transitionLog; }
    clear() { this.delegate.clear?.(); this.auditLog = []; }
}
exports.AuditingFlowStore = AuditingFlowStore;
