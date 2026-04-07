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
}
