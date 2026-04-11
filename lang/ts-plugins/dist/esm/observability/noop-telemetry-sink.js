/** No-op telemetry sink for benchmarking baseline. */
export class NoopTelemetrySink {
    emit(_event) { }
    events() { return []; }
}
