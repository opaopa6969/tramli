package org.unlaxer.tramli.plugins.observability;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class InMemoryTelemetrySink implements TelemetrySink {
    private final List<TelemetryEvent> events = new ArrayList<>();

    @Override
    public void emit(TelemetryEvent event) {
        events.add(event);
    }

    public List<TelemetryEvent> events() {
        return Collections.unmodifiableList(events);
    }
}
