package org.unlaxer.tramli.plugins.observability;

import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.LogEntry;

import java.time.Instant;

public final class ObservabilityPlugin {
    private final TelemetrySink sink;

    public ObservabilityPlugin(TelemetrySink sink) {
        this.sink = sink;
    }

    public void install(FlowEngine engine) {
        engine.setTransitionLogger(t -> sink.emit(new TelemetryEvent("transition", Instant.now(), t.flowId(), t.flowName(),
                t.from() + " -> " + t.to() + " via " + t.trigger(), t.durationMicros())));
        engine.setStateLogger(s -> sink.emit(new TelemetryEvent("state", Instant.now(), s.flowId(), s.flowName(),
                s.typeName() + "=" + String.valueOf(s.value()), 0)));
        engine.setErrorLogger(e -> sink.emit(new TelemetryEvent("error", Instant.now(), e.flowId(), e.flowName(),
                e.trigger() + ": " + (e.cause() != null ? e.cause().getMessage() : "unknown"), e.durationMicros())));
        engine.setGuardLogger(g -> sink.emit(new TelemetryEvent("guard", Instant.now(), g.flowId(), g.flowName(),
                g.guardName() + " -> " + g.result(), g.durationMicros())));
    }
}
