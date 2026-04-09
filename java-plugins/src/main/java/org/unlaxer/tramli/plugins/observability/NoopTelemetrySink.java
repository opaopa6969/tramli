package org.unlaxer.tramli.plugins.observability;

/** No-op telemetry sink for benchmarking baseline. */
public final class NoopTelemetrySink implements TelemetrySink {
    @Override
    public void emit(TelemetryEvent event) {}
}
