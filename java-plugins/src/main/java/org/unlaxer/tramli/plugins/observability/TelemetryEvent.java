package org.unlaxer.tramli.plugins.observability;

import java.time.Instant;

public record TelemetryEvent(String type, Instant timestamp, String flowId, String flowName, String message, long durationMicros) {
    /** Backward-compatible constructor (flowName = "", durationMicros = 0). */
    public TelemetryEvent(String type, Instant timestamp, String flowId, String message) {
        this(type, timestamp, flowId, "", message, 0);
    }
}
