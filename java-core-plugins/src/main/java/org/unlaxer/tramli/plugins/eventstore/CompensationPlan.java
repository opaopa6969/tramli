package org.unlaxer.tramli.plugins.eventstore;

import java.util.Map;

public record CompensationPlan(String compensationName, Map<String, Object> metadata) {}
