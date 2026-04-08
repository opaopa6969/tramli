package org.unlaxer.tramli.plugins.observability;

import java.time.Instant;

public record TelemetryEvent(String type, Instant timestamp, String flowId, String message) {}
