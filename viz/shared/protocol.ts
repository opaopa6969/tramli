// ── tramli-viz WebSocket protocol types ──

/** Static info about a state in the flow. */
export interface StateInfo {
  name: string;
  initial: boolean;
  terminal: boolean;
  x: number;
  y: number;
}

/** Static info about an edge (transition) in the flow. */
export interface EdgeInfo {
  from: string;
  to: string;
  type: 'auto' | 'external' | 'branch' | 'error';
  label: string;
}

/** A sequenced viz event wrapping a TelemetryEvent. */
export interface VizEvent {
  seq: number;
  type: 'transition' | 'guard' | 'error' | 'state';
  flowId: string;
  flowName: string;
  data: Record<string, unknown>;
  timestamp: number; // epoch ms
}

/** Current snapshot of a flow instance. */
export interface FlowSnapshot {
  flowId: string;
  currentState: string;
  startedAt: number;
}

// ── Server → Client ──

export type ServerMessage =
  | { type: 'init'; flowName: string; states: StateInfo[]; edges: EdgeInfo[] }
  | { type: 'event'; event: VizEvent }
  | { type: 'snapshot'; flows: FlowSnapshot[]; events: VizEvent[] }
  | { type: 'metric'; throughput: number; errorRate: number; avgLatencyMicros: number };

// ── Client → Server ──

export type ClientMessage =
  | { type: 'trigger'; action: 'start' | 'resume'; flowId?: string }
  | { type: 'config'; autoSpawn: boolean; intervalMs: number };
