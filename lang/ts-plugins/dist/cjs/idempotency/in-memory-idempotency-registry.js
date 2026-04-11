"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryIdempotencyRegistry = void 0;
class InMemoryIdempotencyRegistry {
    seen = new Set();
    markIfFirstSeen(flowId, commandId) {
        const key = `${flowId}::${commandId}`;
        if (this.seen.has(key))
            return false;
        this.seen.add(key);
        return true;
    }
}
exports.InMemoryIdempotencyRegistry = InMemoryIdempotencyRegistry;
