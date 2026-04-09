package org.unlaxer.tramli.plugins.eventstore;

import java.util.List;

/**
 * Replays versioned transition events using a fold/reducer model.
 *
 * <p>Unlike {@link ReplayService} which assumes full snapshots,
 * this service supports both full-snapshot and diff-based event logs.
 * The {@link ProjectionReducer#initialState()} returns the empty starting state,
 * and {@link ProjectionReducer#apply(Object, VersionedTransitionEvent)} accumulates
 * each event into the projected state.</p>
 *
 * <p>Use this service when you need custom aggregations (e.g., transition count,
 * cumulative metrics) or when the event log stores diffs rather than full snapshots.</p>
 */
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
