import type { VersionedTransitionEvent, ProjectionReducer } from './types.js';

/**
 * Replay service — stateAtVersion using full-snapshot assumption.
 * If moving to diff-only persistence, this must become a fold/reducer.
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
 * Projection replay service — custom reducers for materialized views.
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
