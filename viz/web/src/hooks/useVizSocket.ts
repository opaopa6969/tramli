import { useEffect, useRef, useReducer, useCallback } from 'react';
import type { StateInfo, EdgeInfo, VizEvent, FlowSnapshot, FlowDefinitionInfo, ServerMessage, ClientMessage } from '../types';

export interface TransitAnimation {
  flowId: string;
  from: string;
  to: string;
  flowName: string;
  startedAt: number;
}

export interface VizState {
  connected: boolean;
  /** All SM definitions (multi-SM or single wrapped in array). */
  flows: FlowDefinitionInfo[];
  /** flowId → current state name */
  flowPositions: Map<string, string>;
  /** flowId → flowName (which SM this instance belongs to) */
  flowOwner: Map<string, string>;
  /** flowId → started-at timestamp */
  flowStarted: Map<string, number>;
  flowLastActive: Map<string, number>;
  events: VizEvent[];
  transits: TransitAnimation[];
  /** "flowName:from->to" → count */
  edgeCounts: Map<string, number>;
  /** "flowName:state" → count */
  nodeCounts: Map<string, number>;
  /** "flowName:from->to" → heat */
  edgeHeat: Map<string, number>;
  metrics: { throughput: number; errorRate: number; avgLatencyMicros: number };
}

type Action =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'init'; flowName: string; states: StateInfo[]; edges: EdgeInfo[] }
  | { type: 'init-multi'; flows: FlowDefinitionInfo[] }
  | { type: 'event'; event: VizEvent; now: number }
  | { type: 'snapshot'; flows: FlowSnapshot[]; events: VizEvent[] }
  | { type: 'metric'; throughput: number; errorRate: number; avgLatencyMicros: number }
  | { type: 'replay'; position: number }
  | { type: 'tick'; now: number; transitDuration: number; heatDecay: number };

const initialState: VizState = {
  connected: false,
  flows: [],
  flowPositions: new Map(),
  flowOwner: new Map(),
  flowStarted: new Map(),
  flowLastActive: new Map(),
  events: [],
  transits: [],
  edgeCounts: new Map(),
  nodeCounts: new Map(),
  edgeHeat: new Map(),
  metrics: { throughput: 0, errorRate: 0, avgLatencyMicros: 0 },
};

function applyEvent(
  positions: Map<string, string>,
  started: Map<string, number>,
  owner: Map<string, string>,
  event: VizEvent,
) {
  if (event.type === 'transition') {
    positions.set(event.flowId, event.data.to as string);
    owner.set(event.flowId, event.flowName);
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
      // Backward compat: wrap single flow as multi
      return { ...state, flows: [{ flowName: action.flowName, layer: 1, states: action.states, edges: action.edges }] };
    case 'init-multi':
      return { ...state, flows: action.flows };
    case 'event': {
      const positions = new Map(state.flowPositions);
      const started = new Map(state.flowStarted);
      const owner = new Map(state.flowOwner);
      applyEvent(positions, started, owner, action.event);
      let transits = state.transits;
      const edgeCounts = new Map(state.edgeCounts);
      const nodeCounts = new Map(state.nodeCounts);
      const edgeHeat = new Map(state.edgeHeat);
      const flowLastActive = new Map(state.flowLastActive);
      if (action.event.type === 'transition' && action.event.data.from) {
        const fn = action.event.flowName;
        const from = action.event.data.from as string;
        const to = action.event.data.to as string;
        transits = [
          ...transits.filter(t => t.flowId !== action.event.flowId),
          { flowId: action.event.flowId, from, to, flowName: fn, startedAt: action.now },
        ];
        const edgeKey = `${fn}:${from}->${to}`;
        edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
        const nodeKey = `${fn}:${to}`;
        nodeCounts.set(nodeKey, (nodeCounts.get(nodeKey) ?? 0) + 1);
        edgeHeat.set(edgeKey, Math.min((edgeHeat.get(edgeKey) ?? 0) + 1, 50));
        flowLastActive.set(action.event.flowId, Date.now());
      }
      return {
        ...state,
        events: [...state.events, action.event],
        flowPositions: positions,
        flowStarted: started,
        flowOwner: owner,
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
      const owner = new Map<string, string>();
      for (const f of action.flows) {
        positions.set(f.flowId, f.currentState);
        started.set(f.flowId, f.startedAt);
      }
      for (const ev of action.events) applyEvent(positions, started, owner, ev);
      return { ...state, events: action.events, flowPositions: positions, flowStarted: started, flowOwner: owner };
    }
    case 'metric':
      return { ...state, metrics: { throughput: action.throughput, errorRate: action.errorRate, avgLatencyMicros: action.avgLatencyMicros } };
    case 'replay': {
      const positions = new Map<string, string>();
      const started = new Map<string, number>();
      const owner = new Map<string, string>();
      for (let i = 0; i <= action.position && i < state.events.length; i++) {
        applyEvent(positions, started, owner, state.events[i]);
      }
      return { ...state, flowPositions: positions, flowStarted: started, flowOwner: owner, transits: [] };
    }
    case 'tick': {
      const alive = state.transits.filter(t => action.now - t.startedAt < action.transitDuration);
      let changed = alive.length !== state.transits.length;
      const edgeHeat = new Map<string, number>();
      for (const [key, val] of state.edgeHeat) {
        const next = val * action.heatDecay;
        if (next > 0.05) edgeHeat.set(key, next);
        if (Math.abs(next - val) > 0.01) changed = true;
      }
      // Clean up stale flows
      const terminalNames = new Set<string>();
      for (const f of state.flows) for (const s of f.states) if (s.terminal) terminalNames.add(s.name);
      const positions = new Map(state.flowPositions);
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
      return { ...state, transits: alive, edgeHeat, ...(posChanged ? { flowPositions: positions } : {}) };
    }
    default:
      return state;
  }
}

export const TRANSIT_DURATION = 600;

export function trailSecondsToDecay(seconds: number): number {
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
            case 'init':
              dispatch({ type: 'init', flowName: msg.flowName, states: msg.states, edges: msg.edges });
              break;
            case 'init-multi':
              dispatch({ type: 'init-multi', flows: msg.flows });
              break;
            case 'event':
              dispatch({ type: 'event', event: msg.event, now: performance.now() });
              break;
            case 'snapshot':
              dispatch({ type: 'snapshot', flows: msg.flows, events: msg.events });
              break;
            case 'metric':
              dispatch({ type: 'metric', throughput: msg.throughput, errorRate: msg.errorRate, avgLatencyMicros: msg.avgLatencyMicros });
              break;
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
