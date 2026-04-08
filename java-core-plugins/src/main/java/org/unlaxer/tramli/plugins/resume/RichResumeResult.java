package org.unlaxer.tramli.plugins.resume;

public record RichResumeResult<S>(
        RichResumeStatus status,
        S fromState,
        S toState,
        String message,
        Throwable cause
) {
    public boolean isSuccess() {
        return status == RichResumeStatus.TRANSITIONED;
    }
}
