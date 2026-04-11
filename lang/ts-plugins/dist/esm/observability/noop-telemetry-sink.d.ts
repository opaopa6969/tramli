import type { TelemetrySink, TelemetryEvent } from './observability-plugin.js';
/** No-op telemetry sink for benchmarking baseline. */
export declare class NoopTelemetrySink implements TelemetrySink {
    emit(_event: TelemetryEvent): void;
    events(): readonly TelemetryEvent[];
}
