package org.unlaxer.tramli.plugins.eventstore;

import java.util.Optional;

public interface CompensationResolver {
    Optional<CompensationPlan> resolve(VersionedTransitionEvent sourceEvent, Throwable cause);
}
