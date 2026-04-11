"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowError = void 0;
class FlowError extends Error {
    code;
    /** Error type classification for retry/recovery strategy. */
    errorType;
    /** Types that were available in context when the error occurred. */
    availableTypes;
    /** Types that were expected but missing (if applicable). */
    missingTypes;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'FlowError';
    }
    /** Attach error type classification. */
    withErrorType(type) {
        this.errorType = type;
        return this;
    }
    /** Attach context snapshot to this error. */
    withContextSnapshot(available, missing) {
        this.availableTypes = available;
        this.missingTypes = missing;
        return this;
    }
    static invalidTransition(from, to) {
        return new FlowError('INVALID_TRANSITION', `Invalid transition from ${from} to ${to}`);
    }
    static missingContext(key) {
        return new FlowError('MISSING_CONTEXT', `Missing context key: ${key}`);
    }
    static dagCycle(detail) {
        return new FlowError('DAG_CYCLE', `Auto/Branch transitions contain a cycle: ${detail}`);
    }
    static maxChainDepth() {
        return new FlowError('MAX_CHAIN_DEPTH', 'Auto-chain exceeded maximum depth of 10');
    }
}
exports.FlowError = FlowError;
