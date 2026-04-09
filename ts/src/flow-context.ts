import type { FlowKey } from './flow-key.js';
import { FlowError } from './flow-error.js';

/**
 * Accumulator for flow data. Keyed by FlowKey — each key appears at most once.
 *
 * Use dedicated FlowKey instances as keys (e.g., flowKey<OrderRequest>('OrderRequest')),
 * not raw strings. Putting the same key twice silently overwrites the previous value.
 */
export class FlowContext {
  readonly flowId: string;
  readonly createdAt: Date;
  private attributes: Map<string, unknown>;
  private aliasToKey: Map<string, string> = new Map();
  private keyToAlias: Map<string, string> = new Map();

  constructor(flowId: string, createdAt?: Date, attributes?: Map<string, unknown>) {
    this.flowId = flowId;
    this.createdAt = createdAt ?? new Date();
    this.attributes = new Map(attributes ?? []);
  }

  get<T>(key: FlowKey<T>): T {
    const value = this.attributes.get(key);
    if (value === undefined) throw FlowError.missingContext(key);
    return value as T;
  }

  find<T>(key: FlowKey<T>): T | undefined {
    return this.attributes.get(key) as T | undefined;
  }

  put<T>(key: FlowKey<T>, value: T): void {
    this.attributes.set(key, value);
  }

  has(key: FlowKey<unknown>): boolean {
    return this.attributes.has(key);
  }

  snapshot(): Map<string, unknown> {
    return new Map(this.attributes);
  }

  restoreFrom(snapshot: Map<string, unknown>): void {
    this.attributes.clear();
    for (const [k, v] of snapshot) this.attributes.set(k, v);
  }

  // ─── Alias support (for cross-language serialization) ──────────────────

  /** Register a string alias for a FlowKey. Used for cross-language serialization. */
  registerAlias(key: FlowKey<unknown>, alias: string): void {
    this.aliasToKey.set(alias, key);
    this.keyToAlias.set(key, alias);
  }

  /** Get the alias for a key (if registered). */
  aliasOf(key: FlowKey<unknown>): string | undefined {
    return this.keyToAlias.get(key);
  }

  /** Get the key for an alias (if registered). */
  keyOfAlias(alias: string): FlowKey<unknown> | undefined {
    return this.aliasToKey.get(alias) as FlowKey<unknown> | undefined;
  }

  /** Export all registered aliases as a map (alias → key). */
  toAliasMap(): Map<string, string> {
    return new Map(this.aliasToKey);
  }

  /** Import aliases from a map (alias → key). */
  fromAliasMap(map: Map<string, string>): void {
    for (const [alias, key] of map) {
      this.aliasToKey.set(alias, key);
      this.keyToAlias.set(key, alias);
    }
  }
}
