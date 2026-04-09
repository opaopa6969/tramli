import { WebSocketServer } from 'ws';
import { VizSink } from './viz-sink.js';
import type { ClientMessage, StateInfo, EdgeInfo } from '../shared/protocol.js';
import type { FlowEngine, FlowDefinition } from '@unlaxer/tramli';

export interface VizServerOptions {
  port?: number;
  engine: FlowEngine;
  definition: FlowDefinition<string>;
  states: StateInfo[];
  edges: EdgeInfo[];
  onTrigger?: (action: 'start' | 'resume', flowId?: string) => void;
}

export function startVizServer(sink: VizSink, opts: VizServerOptions) {
  const port = opts.port ?? 3001;
  const wss = new WebSocketServer({ port });

  console.log(`[viz-server] WebSocket listening on ws://localhost:${port}`);

  wss.on('connection', (ws) => {
    console.log('[viz-server] Client connected');
    // Send flow topology
    ws.send(JSON.stringify({
      type: 'init',
      flowName: opts.definition.name,
      states: opts.states,
      edges: opts.edges,
    }));
    sink.addClient(ws);

    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        if (msg.type === 'trigger' && opts.onTrigger) {
          opts.onTrigger(msg.action, msg.flowId);
        }
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      sink.removeClient(ws);
      console.log('[viz-server] Client disconnected');
    });
  });

  // Metrics broadcast every 2 seconds
  setInterval(() => {
    const log = sink.getEventLog();
    const now = Date.now();
    const window = 10_000; // 10s window
    const recent = log.filter(e => e.timestamp > now - window);
    const transitions = recent.filter(e => e.type === 'transition');
    const errors = recent.filter(e => e.type === 'error');
    const latencies = transitions
      .map(e => e.data.durationMicros as number)
      .filter(d => d != null);

    sink.broadcast({
      type: 'metric',
      throughput: transitions.length / (window / 1000),
      errorRate: transitions.length > 0 ? errors.length / (transitions.length + errors.length) : 0,
      avgLatencyMicros: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
    });
  }, 2000);

  return wss;
}
