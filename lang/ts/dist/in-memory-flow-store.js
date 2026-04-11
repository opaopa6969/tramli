export class InMemoryFlowStore {
    flows = new Map();
    _transitionLog = [];
    create(flow) {
        this.flows.set(flow.id, flow);
    }
    loadForUpdate(flowId) {
        const flow = this.flows.get(flowId);
        if (!flow || flow.isCompleted)
            return undefined;
        return flow;
    }
    save(flow) {
        this.flows.set(flow.id, flow);
    }
    recordTransition(flowId, from, to, trigger, _ctx) {
        const subFlow = trigger.startsWith('subFlow:') ? trigger.substring(8, trigger.indexOf('/')) : null;
        this._transitionLog.push({ flowId, from, to, trigger, subFlow, timestamp: new Date() });
    }
    get transitionLog() {
        return this._transitionLog;
    }
}
