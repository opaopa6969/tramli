export type FlowErrorType = 'BUSINESS' | 'SYSTEM' | 'RETRYABLE' | 'FATAL';
export declare class FlowError extends Error {
    readonly code: string;
    /** Error type classification for retry/recovery strategy. */
    errorType?: FlowErrorType;
    /** Types that were available in context when the error occurred. */
    availableTypes?: Set<string>;
    /** Types that were expected but missing (if applicable). */
    missingTypes?: Set<string>;
    constructor(code: string, message: string);
    /** Attach error type classification. */
    withErrorType(type: FlowErrorType): this;
    /** Attach context snapshot to this error. */
    withContextSnapshot(available: Set<string>, missing: Set<string>): this;
    static invalidTransition(from: string, to: string): FlowError;
    static missingContext(key: string): FlowError;
    static dagCycle(detail: string): FlowError;
    static maxChainDepth(): FlowError;
}
