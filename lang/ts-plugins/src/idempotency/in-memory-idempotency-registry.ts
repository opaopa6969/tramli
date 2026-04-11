import type { IdempotencyRegistry } from './types.js';

export class InMemoryIdempotencyRegistry implements IdempotencyRegistry {
  private readonly seen = new Set<string>();

  markIfFirstSeen(flowId: string, commandId: string): boolean {
    const key = `${flowId}::${commandId}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}
