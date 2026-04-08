package org.unlaxer.tramli.plugins.eventstore;

import java.time.Instant;
import java.util.Map;

public record VersionedTransitionEvent(
        long version,
        String flowId,
        String from,
        String to,
        String trigger,
        Instant timestamp,
        Map<String, Object> dataSnapshot,
        String eventType,
        Map<String, Object> metadata
) {}
