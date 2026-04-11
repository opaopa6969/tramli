"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityEnginePlugin = exports.InMemoryTelemetrySink = void 0;
class InMemoryTelemetrySink {
    log = [];
    emit(event) { this.log.push(event); }
    events() { return this.log; }
}
exports.InMemoryTelemetrySink = InMemoryTelemetrySink;
class ObservabilityEnginePlugin {
    sink;
    constructor(sink) {
        this.sink = sink;
    }
    descriptor() {
        return { id: 'observability', displayName: 'Observability', description: 'Telemetry via engine logger hooks' };
    }
    kind() { return 'ENGINE'; }
    install(engine, options) {
        const append = options?.append ?? false;
        const prevTransition = append ? engine.getTransitionLogger() : undefined;
        const prevError = append ? engine.getErrorLogger() : undefined;
        const prevGuard = append ? engine.getGuardLogger() : undefined;
        engine.setTransitionLogger(entry => {
            prevTransition?.(entry);
            this.sink.emit({
                type: 'transition', flowId: entry.flowId, flowName: entry.flowName,
                data: { from: entry.from, to: entry.to, trigger: entry.trigger, durationMicros: entry.durationMicros },
                timestamp: new Date(),
            });
        });
        engine.setErrorLogger(entry => {
            prevError?.(entry);
            this.sink.emit({
                type: 'error', flowId: entry.flowId, flowName: entry.flowName,
                data: { from: entry.from, to: entry.to, trigger: entry.trigger, cause: entry.cause?.message, durationMicros: entry.durationMicros },
                timestamp: new Date(),
            });
        });
        engine.setGuardLogger((entry) => {
            prevGuard?.(entry);
            this.sink.emit({
                type: 'guard', flowId: entry.flowId, flowName: entry.flowName,
                data: { state: entry.state, guardName: entry.guardName, result: entry.result, reason: entry.reason, durationMicros: entry.durationMicros },
                timestamp: new Date(),
            });
        });
    }
}
exports.ObservabilityEnginePlugin = ObservabilityEnginePlugin;
