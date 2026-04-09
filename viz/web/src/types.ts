// Mirror of viz/shared/protocol.ts — for the web bundle (no Node.js imports)

export interface StateInfo {
  name: string;
  initial: boolean;
  terminal: boolean;
  x: number;
  y: number;
}

export interface EdgeInfo {
  from: string;
  to: string;
  type: 'auto' | 'external' | 'branch' | 'error';
  label: string;
}

export interface VizEvent {
  seq: number;
  type: 'transition' | 'guard' | 'error' | 'state';
  flowId: string;
  flowName: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface FlowSnapshot {
  flowId: string;
  currentState: string;
  startedAt: number;
}

export type ServerMessage =
  | { type: 'init'; flowName: string; states: StateInfo[]; edges: EdgeInfo[] }
  | { type: 'event'; event: VizEvent }
  | { type: 'snapshot'; flows: FlowSnapshot[]; events: VizEvent[] }
  | { type: 'metric'; throughput: number; errorRate: number; avgLatencyMicros: number };

export type ClientMessage =
  | { type: 'trigger'; action: 'start' | 'resume'; flowId?: string }
  | { type: 'config'; autoSpawn: boolean; intervalMs: number };
