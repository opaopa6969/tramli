package org.unlaxer.tramli.plugins.idempotency;

import java.util.Map;

public record CommandEnvelope(String commandId, Map<Class<?>, Object> externalData) {}
