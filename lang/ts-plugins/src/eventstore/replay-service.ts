import type { VersionedTransitionEvent, ProjectionReducer } from './types.js';

/**
 * Replay service — reconstructs flow state at any version.
 *
 * Assumes each TRANSITION event stores a full snapshot of the state.
 * Returns the latest matching state at or before the requested version.
 *
 * If the event log is later changed to store diffs instead of full snapshots,
 * use {@link ProjectionReplayService} with a fold/reducer instead.
 */
export class ReplayService {
  stateAtVersion(events: readonly VersionedTransitionEvent[], flowId: string, targetVersion: number): string | null {
    const flowEvents = events
      .filter(e => e.flowId === flowId && e.type === 'TRANSITION' && e.version <= targetVersion)
      .sort((a, b) => a.version - b.version);
    if (flowEvents.length === 0) return null;
    return flowEvents[flowEvents.length - 1].to;
  }
}

/**
 * Projection replay service — fold/reducer model for custom aggregations.
 *
 * Unlike {@link ReplayService} which assumes full snapshots,
 * this service supports both full-snapshot and diff-based event logs.
 * `reducer.initialState()` returns the empty starting state,
 * `reducer.apply(state, event)` accumulates each event.
 *
 * Use for custom aggregations (transition count, cumulative metrics)
 * or when the event log stores diffs rather than full snapshots.
 */
export class ProjectionReplayService {
  stateAtVersion<T>(
    events: readonly VersionedTransitionEvent[],
    flowId: string,
    targetVersion: number,
    reducer: ProjectionReducer<T>,
  ): T {
    let state = reducer.initialState();
    for (const event of events) {
      if (event.flowId === flowId && event.version <= targetVersion) {
        state = reducer.apply(state, event);
      }
    }
    return state;
  }
}
