package org.unlaxer.tramli.plugins.idempotency;

import java.util.HashSet;
import java.util.Set;

public final class InMemoryIdempotencyRegistry implements IdempotencyRegistry {
    private final Set<String> seen = new HashSet<>();

    @Override
    public synchronized boolean markIfFirstSeen(String flowId, String commandId) {
        return seen.add(flowId + "::" + commandId);
    }
}
