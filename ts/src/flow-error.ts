export class FlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FlowError';
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
