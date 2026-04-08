package org.unlaxer.tramli.plugins.eventstore;

import java.util.Optional;

public final class CompensationService {
    private final CompensationResolver resolver;
    private final EventLogStoreDecorator eventLog;

    public CompensationService(CompensationResolver resolver, EventLogStoreDecorator eventLog) {
        this.resolver = resolver;
        this.eventLog = eventLog;
    }

    public boolean compensate(VersionedTransitionEvent sourceEvent, Throwable cause) {
        Optional<CompensationPlan> plan = resolver.resolve(sourceEvent, cause);
        if (plan.isEmpty()) {
            return false;
        }
        CompensationPlan value = plan.get();
        eventLog.recordCompensation(sourceEvent.flowId(), value.compensationName(), value.metadata());
        return true;
    }
}
