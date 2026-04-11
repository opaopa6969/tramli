import { FlowError } from './flow-error.js';
/**
 * Accumulator for flow data. Keyed by FlowKey — each key appears at most once.
 *
 * Use dedicated FlowKey instances as keys (e.g., flowKey<OrderRequest>('OrderRequest')),
 * not raw strings. Putting the same key twice silently overwrites the previous value.
 */
export class FlowContext {
    flowId;
    createdAt;
    attributes;
    constructor(flowId, createdAt, attributes) {
        this.flowId = flowId;
        this.createdAt = createdAt ?? new Date();
        this.attributes = new Map(attributes ?? []);
    }
    get(key) {
        const value = this.attributes.get(key);
        if (value === undefined)
            throw FlowError.missingContext(key);
        return value;
    }
    find(key) {
        return this.attributes.get(key);
    }
    put(key, value) {
        this.attributes.set(key, value);
    }
    has(key) {
        return this.attributes.has(key);
    }
    snapshot() {
        return new Map(this.attributes);
    }
    restoreFrom(snapshot) {
        this.attributes.clear();
        for (const [k, v] of snapshot)
            this.attributes.set(k, v);
    }
}
