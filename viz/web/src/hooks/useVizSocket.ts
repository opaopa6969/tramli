import { useEffect, useRef, useReducer, useCallback } from 'react';
import type { StateInfo, EdgeInfo, VizEvent, FlowSnapshot, ServerMessage, ClientMessage } from '../types';

export interface TransitAnimation {
  flowId: string;
  from: string;
  to: string;
  startedAt: number;
}

export interface VizState {
  connected: boolean;
  flowName: string;
  states: StateInfo[];
  edges: EdgeInfo[];
  flowPositions: Map<string, string>;
  flowStarted: Map<string, number>;
  /** flowId → last transition timestamp (for stale cleanup) */
  flowLastActive: Map<string, number>;
  events: VizEvent[];
  transits: TransitAnimation[];
  edgeCounts: Map<string, number>;
  nodeCounts: Map<string, number>;
  edgeHeat: Map<string, number>;
  metrics: { throughput: number; errorRate: number; avgLatencyMicros: number };
}

type Action =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'init'; flowName: string; states: StateInfo[]; edges: EdgeInfo[] }
  | { type: 'event'; event: VizEvent; now: number }
  | { type: 'snapshot'; flows: FlowSnapshot[]; events: VizEvent[] }
  | { type: 'metric'; throughput: number; errorRate: number; avgLatencyMicros: number }
  | { type: 'replay'; position: number }
  | { type: 'tick'; now: number; transitDuration: number; heatDecay: number };

const initialState: VizState = {
  connected: false,
  flowName: '',
  states: [],
  edges: [],
  flowPositions: new Map(),
  flowStarted: new Map(),
  flowLastActive: new Map(),
  events: [],
  transits: [],
  edgeCounts: new Map(),
  nodeCounts: new Map(),
  edgeHeat: new Map(),
  metrics: { throughput: 0, errorRate: 0, avgLatencyMicros: 0 },
};

function applyEvent(positions: Map<string, string>, started: Map<string, number>, event: VizEvent) {
  if (event.type === 'transition') {
    positions.set(event.flowId, event.data.to as string);
    if (!started.has(event.flowId)) started.set(event.flowId, event.timestamp);
  }
}

function reducer(state: VizState, action: Action): VizState {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: true };
    case 'disconnected':
      return { ...state, connected: false };
    case 'init':
      return { ...state, flowName: action.flowName, states: action.states, edges: action.edges };
    case 'event': {
      const positions = new Map(state.flowPositions);
      const started = new Map(state.flowStarted);
      applyEvent(positions, started, action.event);
      let transits = state.transits;
      const edgeCounts = new Map(state.edgeCounts);
      const nodeCounts = new Map(state.nodeCounts);
      const edgeHeat = new Map(state.edgeHeat);
      const flowLastActive = new Map(state.flowLastActive);
      if (action.event.type === 'transition' && action.event.data.from) {
        const from = action.event.data.from as string;
        const to = action.event.data.to as string;
        transits = [
          ...transits.filter(t => t.flowId !== action.event.flowId),
          { flowId: action.event.flowId, from, to, startedAt: action.now },
        ];
        const key = `${from}->${to}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        nodeCounts.set(to, (nodeCounts.get(to) ?? 0) + 1);
        // Cap heat to prevent unbounded growth with long trail durations
        edgeHeat.set(key, Math.min((edgeHeat.get(key) ?? 0) + 1, 50));
        flowLastActive.set(action.event.flowId, Date.now());
      }
      return {
        ...state,
        events: [...state.events, action.event],
        flowPositions: positions,
        flowStarted: started,
        flowLastActive,
        transits,
        edgeCounts,
        nodeCounts,
        edgeHeat,
      };
    }
    case 'snapshot': {
      const positions = new Map<string, string>();
      const started = new Map<string, number>();
      for (const f of action.flows) {
        positions.set(f.flowId, f.currentState);
        started.set(f.flowId, f.startedAt);
      }
      for (const ev of action.events) applyEvent(positions, started, ev);
      return { ...state, events: action.events, flowPositions: positions, flowStarted: started };
    }
    case 'metric':
      return { ...state, metrics: { throughput: action.throughput, errorRate: action.errorRate, avgLatencyMicros: action.avgLatencyMicros } };
    case 'replay': {
      const positions = new Map<string, string>();
      const started = new Map<string, number>();
      for (let i = 0; i <= action.position && i < state.events.length; i++) {
        applyEvent(positions, started, state.events[i]);
      }
      return { ...state, flowPositions: positions, flowStarted: started, transits: [] };
    }
    case 'tick': {
      const alive = state.transits.filter(t => action.now - t.startedAt < action.transitDuration);
      // Decay edge heat
      let changed = alive.length !== state.transits.length;
      const edgeHeat = new Map<string, number>();
      for (const [key, val] of state.edgeHeat) {
        const next = val * action.heatDecay;
        if (next > 0.05) { edgeHeat.set(key, next); }
        if (Math.abs(next - val) > 0.01) changed = true;
      }
      // Clean up stale flows: terminal for >5s OR inactive for >15s
      const positions = new Map(state.flowPositions);
      const terminalNames = new Set(state.states.filter(s => s.terminal).map(s => s.name));
      const now = Date.now();
      let posChanged = false;
      for (const [flowId, stateName] of positions) {
        const lastActive = state.flowLastActive.get(flowId) ?? 0;
        const isTerminal = terminalNames.has(stateName);
        const staleMs = now - lastActive;
        if ((isTerminal && staleMs > 3000) || (!isTerminal && staleMs > 15000)) {
          positions.delete(flowId);
          posChanged = true;
        }
      }
      if (!changed && !posChanged) return state;
      return {
        ...state,
        transits: alive,
        edgeHeat,
        ...(posChanged ? { flowPositions: positions } : {}),
      };
    }
    default:
      return state;
  }
}

export const TRANSIT_DURATION = 600;

/** Convert a "trail seconds" value to a per-tick (100ms) decay factor. */
export function trailSecondsToDecay(seconds: number): number {
  // We want heat * decay^(seconds*10) ≈ 0.05 (threshold)
  // So decay = 0.05^(1/(seconds*10))
  return Math.pow(0.05, 1 / (seconds * 10));
}

export function useVizSocket(url = 'ws://localhost:3001') {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const heatDecayRef = useRef(trailSecondsToDecay(1.5));

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => dispatch({ type: 'connected' });
      ws.onmessage = (e) => {
        try {
          const msg: ServerMessage = JSON.parse(e.data as string);
          switch (msg.type) {
            case 'init': dispatch({ type: 'init', flowName: msg.flowName, states: msg.states, edges: msg.edges }); break;
            case 'event': dispatch({ type: 'event', event: msg.event, now: performance.now() }); break;
            case 'snapshot': dispatch({ type: 'snapshot', flows: msg.flows, events: msg.events }); break;
            case 'metric': dispatch({ type: 'metric', throughput: msg.throughput, errorRate: msg.errorRate, avgLatencyMicros: msg.avgLatencyMicros }); break;
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { dispatch({ type: 'disconnected' }); if (!closed) reconnectTimer = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { closed = true; clearTimeout(reconnectTimer); wsRef.current?.close(); };
  }, [url]);

  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: 'tick', now: performance.now(), transitDuration: TRANSIT_DURATION, heatDecay: heatDecayRef.current });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const replay = useCallback((position: number) => { dispatch({ type: 'replay', position }); }, []);

  const setHeatDecay = useCallback((seconds: number) => {
    heatDecayRef.current = trailSecondsToDecay(seconds);
  }, []);

  return { state, send, replay, setHeatDecay };
}
