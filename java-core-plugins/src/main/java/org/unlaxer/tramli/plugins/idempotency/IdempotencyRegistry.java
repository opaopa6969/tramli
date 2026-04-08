package org.unlaxer.tramli.plugins.idempotency;

public interface IdempotencyRegistry {
    boolean markIfFirstSeen(String flowId, String commandId);
}
