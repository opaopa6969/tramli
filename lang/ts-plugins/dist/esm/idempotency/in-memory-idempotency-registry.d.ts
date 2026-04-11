import type { IdempotencyRegistry } from './types.js';
export declare class InMemoryIdempotencyRegistry implements IdempotencyRegistry {
    private readonly seen;
    markIfFirstSeen(flowId: string, commandId: string): boolean;
}
