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
    aliasToKey = new Map();
    keyToAlias = new Map();
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
    // ─── Alias support (for cross-language serialization) ──────────────────
    /** Register a string alias for a FlowKey. Used for cross-language serialization. */
    registerAlias(key, alias) {
        this.aliasToKey.set(alias, key);
        this.keyToAlias.set(key, alias);
    }
    /** Get the alias for a key (if registered). */
    aliasOf(key) {
        return this.keyToAlias.get(key);
    }
    /** Get the key for an alias (if registered). */
    keyOfAlias(alias) {
        return this.aliasToKey.get(alias);
    }
    /** Export all registered aliases as a map (alias → key). */
    toAliasMap() {
        return new Map(this.aliasToKey);
    }
    /** Import aliases from a map (alias → key). */
    fromAliasMap(map) {
        for (const [alias, key] of map) {
            this.aliasToKey.set(alias, key);
            this.keyToAlias.set(key, alias);
        }
    }
}
