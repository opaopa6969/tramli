"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopTelemetrySink = void 0;
/** No-op telemetry sink for benchmarking baseline. */
class NoopTelemetrySink {
    emit(_event) { }
    events() { return []; }
}
exports.NoopTelemetrySink = NoopTelemetrySink;
