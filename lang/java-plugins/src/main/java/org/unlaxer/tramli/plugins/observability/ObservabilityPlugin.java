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
        install(engine, false);
    }

    public void install(FlowEngine engine, boolean append) {
        var prevTransition = append ? engine.getTransitionLogger() : null;
        var prevState = append ? engine.getStateLogger() : null;
        var prevError = append ? engine.getErrorLogger() : null;
        var prevGuard = append ? engine.getGuardLogger() : null;

        engine.setTransitionLogger(t -> {
            if (prevTransition != null) prevTransition.accept(t);
            sink.emit(new TelemetryEvent("transition", Instant.now(), t.flowId(), t.flowName(),
                    t.from() + " -> " + t.to() + " via " + t.trigger(), t.durationMicros()));
        });
        engine.setStateLogger(s -> {
            if (prevState != null) prevState.accept(s);
            sink.emit(new TelemetryEvent("state", Instant.now(), s.flowId(), s.flowName(),
                    s.typeName() + "=" + String.valueOf(s.value()), 0));
        });
        engine.setErrorLogger(e -> {
            if (prevError != null) prevError.accept(e);
            sink.emit(new TelemetryEvent("error", Instant.now(), e.flowId(), e.flowName(),
                    e.trigger() + ": " + (e.cause() != null ? e.cause().getMessage() : "unknown"), e.durationMicros()));
        });
        engine.setGuardLogger(g -> {
            if (prevGuard != null) prevGuard.accept(g);
            sink.emit(new TelemetryEvent("guard", Instant.now(), g.flowId(), g.flowName(),
                    g.guardName() + " -> " + g.result(), g.durationMicros()));
        });
    }
}
