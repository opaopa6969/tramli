import { WebSocketServer } from 'ws';
import { VizSink } from './viz-sink.js';
import type { ClientMessage, StateInfo, EdgeInfo } from './shared/protocol.js';
import type { FlowEngine, FlowDefinition } from '@unlaxer/tramli';

/** Single-SM options (backward compatible). */
export interface VizServerOptionsSingle {
  port?: number;
  engine: FlowEngine;
  definition: FlowDefinition<string>;
  states: StateInfo[];
  edges: EdgeInfo[];
  onTrigger?: (action: 'start' | 'resume', flowId?: string) => void;
}

/** Multi-SM flow definition. */
export interface VizFlowDef {
  flowName: string;
  layer: 1 | 2;
  states: StateInfo[];
  edges: EdgeInfo[];
}

/** Multi-SM options. */
export interface VizServerOptionsMulti {
  port?: number;
  engine: FlowEngine;
  definitions: VizFlowDef[];
  onTrigger?: (action: 'start' | 'resume', flowId?: string) => void;
}

export type VizServerOptions = VizServerOptionsSingle | VizServerOptionsMulti;

function isMulti(opts: VizServerOptions): opts is VizServerOptionsMulti {
  return 'definitions' in opts;
}

export function startVizServer(sink: VizSink, opts: VizServerOptions) {
  const port = (opts as any).port ?? 3001;
  const wss = new WebSocketServer({ port });

  // Build flow definitions array
  const flowDefs: VizFlowDef[] = isMulti(opts)
    ? opts.definitions
    : [{ flowName: opts.definition.name, layer: 1 as const, states: opts.states, edges: opts.edges }];

  // Register layers in sink
  for (const fd of flowDefs) {
    sink.registerLayer(fd.flowName, fd.layer);
  }

  console.log(`[viz-server] WebSocket listening on ws://localhost:${port} (${flowDefs.length} SM${flowDefs.length > 1 ? 's' : ''})`);

  wss.on('connection', (ws) => {
    console.log('[viz-server] Client connected');

    // Send topology
    if (flowDefs.length === 1) {
      // Backward compatible single init
      ws.send(JSON.stringify({
        type: 'init',
        flowName: flowDefs[0].flowName,
        states: flowDefs[0].states,
        edges: flowDefs[0].edges,
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'init-multi',
        flows: flowDefs,
      }));
    }
    sink.addClient(ws);

    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        if (msg.type === 'trigger' && opts.onTrigger) {
          opts.onTrigger(msg.action, msg.flowId);
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      sink.removeClient(ws);
      console.log('[viz-server] Client disconnected');
    });
  });

  // Metrics broadcast
  setInterval(() => {
    const log = sink.getEventLog();
    const now = Date.now();
    const window = 10_000;
    const recent = log.filter(e => e.timestamp > now - window);
    const transitions = recent.filter(e => e.type === 'transition');
    const errors = recent.filter(e => e.type === 'error');
    const latencies = transitions.map(e => e.data.durationMicros as number).filter(d => d != null);
    sink.broadcast({
      type: 'metric',
      throughput: transitions.length / (window / 1000),
      errorRate: transitions.length > 0 ? errors.length / (transitions.length + errors.length) : 0,
      avgLatencyMicros: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    });
  }, 2000);

  return wss;
}
