package org.unlaxer.tramli.plugins.observability;

public interface TelemetrySink {
    void emit(TelemetryEvent event);
}
