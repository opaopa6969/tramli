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
        engine.setTransitionLogger(t -> sink.emit(new TelemetryEvent("transition", Instant.now(), t.flowId(),
                t.from() + " -> " + t.to() + " via " + t.trigger())));
        engine.setStateLogger(s -> sink.emit(new TelemetryEvent("state", Instant.now(), s.flowId(),
                s.typeName() + "=" + String.valueOf(s.value()))));
        engine.setErrorLogger(e -> sink.emit(new TelemetryEvent("error", Instant.now(), e.flowId(),
                e.trigger() + ": " + e.cause().getMessage())));
        engine.setGuardLogger(g -> sink.emit(new TelemetryEvent("guard", Instant.now(), g.flowId(),
                g.guardName() + " -> " + g.result())));
    }
}
