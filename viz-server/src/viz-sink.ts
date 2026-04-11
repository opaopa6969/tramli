import type { TelemetrySink, TelemetryEvent } from '@unlaxer/tramli-plugins';
import type { WebSocket } from 'ws';
import type { VizEvent, FlowSnapshot, ServerMessage } from './shared/protocol.js';

export class VizSink implements TelemetrySink {
  private readonly log: VizEvent[] = [];
  private seq = 0;
  private readonly clients = new Set<WebSocket>();
  private readonly flowStates = new Map<string, FlowSnapshot>();
  /** flowName → layer mapping for enriching events. */
  private readonly flowNameToLayer = new Map<string, 1 | 2>();

  /** Register a flow name → layer mapping. */
  registerLayer(flowName: string, layer: 1 | 2): void {
    this.flowNameToLayer.set(flowName, layer);
  }

  emit(event: TelemetryEvent): void {
    const vizEvent: VizEvent = {
      seq: this.seq++,
      type: event.type,
      flowId: event.flowId,
      flowName: event.flowName,
      data: event.data,
      timestamp: Date.now(),
      layer: this.flowNameToLayer.get(event.flowName),
    };
    this.log.push(vizEvent);

    if (event.type === 'transition') {
      const existing = this.flowStates.get(event.flowId);
      if (existing) {
        existing.currentState = event.data.to as string;
      } else {
        this.flowStates.set(event.flowId, {
          flowId: event.flowId,
          currentState: event.data.to as string,
          startedAt: Date.now(),
        });
      }
    }

    this.broadcast({ type: 'event', event: vizEvent });
  }

  events(): readonly TelemetryEvent[] {
    return this.log.map(v => ({
      type: v.type,
      flowId: v.flowId,
      flowName: v.flowName,
      data: v.data,
      timestamp: new Date(v.timestamp),
    }));
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    const snapshot: ServerMessage = {
      type: 'snapshot',
      flows: [...this.flowStates.values()],
      events: this.log.slice(-500),
    };
    ws.send(JSON.stringify(snapshot));
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(msg: ServerMessage): void {
    const json = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(json);
    }
  }

  getFlowSnapshots(): FlowSnapshot[] {
    return [...this.flowStates.values()];
  }

  getEventLog(): VizEvent[] {
    return this.log;
  }
}
