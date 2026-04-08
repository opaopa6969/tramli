package org.unlaxer.tramli.plugins.eventstore;

import java.util.List;

public final class ProjectionReplayService {
    public <V> V stateAtVersion(List<VersionedTransitionEvent> allEvents, String flowId, long version, ProjectionReducer<V> reducer) {
        V current = reducer.initialState();
        for (VersionedTransitionEvent event : allEvents) {
            if (flowId.equals(event.flowId()) && event.version() <= version) {
                current = reducer.apply(current, event);
            }
        }
        return current;
    }
}
