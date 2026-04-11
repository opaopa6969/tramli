/**
 * Command envelope — wraps external data with a unique command ID for dedup.
 */
export interface CommandEnvelope {
  commandId: string;
  externalData: Map<string, unknown>;
}

/**
 * Idempotency registry — tracks which commands have already been processed.
 */
export interface IdempotencyRegistry {
  markIfFirstSeen(flowId: string, commandId: string): boolean;
}
