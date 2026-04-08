package com.tramli;

/**
 * Classification of flow errors for retry/recovery strategy.
 * Attach to FlowException via {@link FlowException#withErrorType(FlowErrorType)}.
 */
public enum FlowErrorType {
    /** Business rule violation (e.g. invalid input, policy rejection). Not retryable. */
    BUSINESS,
    /** System/infrastructure error (e.g. DB down, service unavailable). May be retryable. */
    SYSTEM,
    /** Explicitly retryable error (e.g. timeout, rate limit). Should retry. */
    RETRYABLE,
    /** Fatal/unrecoverable error (e.g. data corruption, auth failure). Must not retry. */
    FATAL
}
