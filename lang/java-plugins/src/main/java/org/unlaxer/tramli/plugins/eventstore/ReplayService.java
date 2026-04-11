package org.unlaxer.tramli.plugins.eventstore;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Replays versioned transition events for a flow.
 *
 * <p>Current semantics assume that each TRANSITION event stores a full snapshot
 * of the projected data at that version. Therefore {@link #stateAtVersion(List, String, long)}
 * returns the latest matching snapshot at or before the requested version.</p>
 *
 * <p>If the event log is later changed to store diffs instead of full snapshots,
 * this implementation must be replaced by a fold/reducer-based replay.</p>
 */
public final class ReplayService {
    public Map<String, Object> stateAtVersion(List<VersionedTransitionEvent> allEvents, String flowId, long version) {
        List<VersionedTransitionEvent> filtered = new ArrayList<>();
        for (VersionedTransitionEvent event : allEvents) {
            if (flowId.equals(event.flowId()) && event.version() <= version && "TRANSITION".equals(event.eventType())) {
                filtered.add(event);
            }
        }
        return filtered.isEmpty() ? Map.of() : filtered.get(filtered.size() - 1).dataSnapshot();
    }
}
