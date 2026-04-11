import type { FlowKey } from './flow-key.js';
/**
 * Accumulator for flow data. Keyed by FlowKey — each key appears at most once.
 *
 * Use dedicated FlowKey instances as keys (e.g., flowKey<OrderRequest>('OrderRequest')),
 * not raw strings. Putting the same key twice silently overwrites the previous value.
 */
export declare class FlowContext {
    readonly flowId: string;
    readonly createdAt: Date;
    private attributes;
    private aliasToKey;
    private keyToAlias;
    constructor(flowId: string, createdAt?: Date, attributes?: Map<string, unknown>);
    get<T>(key: FlowKey<T>): T;
    find<T>(key: FlowKey<T>): T | undefined;
    put<T>(key: FlowKey<T>, value: T): void;
    has(key: FlowKey<unknown>): boolean;
    snapshot(): Map<string, unknown>;
    restoreFrom(snapshot: Map<string, unknown>): void;
    /** Register a string alias for a FlowKey. Used for cross-language serialization. */
    registerAlias(key: FlowKey<unknown>, alias: string): void;
    /** Get the alias for a key (if registered). */
    aliasOf(key: FlowKey<unknown>): string | undefined;
    /** Get the key for an alias (if registered). */
    keyOfAlias(alias: string): FlowKey<unknown> | undefined;
    /** Export all registered aliases as a map (alias → key). */
    toAliasMap(): Map<string, string>;
    /** Import aliases from a map (alias → key). */
    fromAliasMap(map: Map<string, string>): void;
}
