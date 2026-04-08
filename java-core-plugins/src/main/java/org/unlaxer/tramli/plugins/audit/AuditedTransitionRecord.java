package org.unlaxer.tramli.plugins.audit;

import java.time.Instant;
import java.util.Map;

public record AuditedTransitionRecord(
        String flowId,
        String from,
        String to,
        String trigger,
        Instant timestamp,
        Map<String, String> producedData
) {}
