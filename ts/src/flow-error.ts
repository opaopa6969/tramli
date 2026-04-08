export type FlowErrorType = 'BUSINESS' | 'SYSTEM' | 'RETRYABLE' | 'FATAL';

export class FlowError extends Error {
  /** Error type classification for retry/recovery strategy. */
  errorType?: FlowErrorType;
  /** Types that were available in context when the error occurred. */
  availableTypes?: Set<string>;
  /** Types that were expected but missing (if applicable). */
  missingTypes?: Set<string>;

  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FlowError';
  }

  /** Attach error type classification. */
  withErrorType(type: FlowErrorType): this {
    this.errorType = type;
    return this;
  }

  /** Attach context snapshot to this error. */
  withContextSnapshot(available: Set<string>, missing: Set<string>): this {
    this.availableTypes = available;
    this.missingTypes = missing;
    return this;
  }

  static invalidTransition(from: string, to: string): FlowError {
    return new FlowError('INVALID_TRANSITION', `Invalid transition from ${from} to ${to}`);
  }

  static missingContext(key: string): FlowError {
    return new FlowError('MISSING_CONTEXT', `Missing context key: ${key}`);
  }

  static dagCycle(detail: string): FlowError {
    return new FlowError('DAG_CYCLE', `Auto/Branch transitions contain a cycle: ${detail}`);
  }

  static maxChainDepth(): FlowError {
    return new FlowError('MAX_CHAIN_DEPTH', 'Auto-chain exceeded maximum depth of 10');
  }
}
