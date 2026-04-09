import type { FlowEngine, GuardLogEntry } from '@unlaxer/tramli';
import type { EnginePlugin, PluginDescriptor } from '../api/types.js';

export interface TelemetryEvent {
  type: 'transition' | 'guard' | 'error' | 'state';
  flowId: string;
  flowName: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void;
  events(): readonly TelemetryEvent[];
}

export class InMemoryTelemetrySink implements TelemetrySink {
  private log: TelemetryEvent[] = [];
  emit(event: TelemetryEvent): void { this.log.push(event); }
  events(): readonly TelemetryEvent[] { return this.log; }
}

export class ObservabilityEnginePlugin implements EnginePlugin {
  constructor(private readonly sink: TelemetrySink) {}

  descriptor(): PluginDescriptor {
    return { id: 'observability', displayName: 'Observability', description: 'Telemetry via engine logger hooks' };
  }
  kind() { return 'ENGINE' as const; }

  install(engine: FlowEngine, options?: { append?: boolean }): void {
    const append = options?.append ?? false;
    const prevTransition = append ? engine.getTransitionLogger() : undefined;
    const prevError = append ? engine.getErrorLogger() : undefined;
    const prevGuard = append ? engine.getGuardLogger() : undefined;

    engine.setTransitionLogger(entry => {
      prevTransition?.(entry);
      this.sink.emit({
        type: 'transition', flowId: entry.flowId, flowName: entry.flowName,
        data: { from: entry.from, to: entry.to, trigger: entry.trigger, durationMicros: entry.durationMicros },
        timestamp: new Date(),
      });
    });
    engine.setErrorLogger(entry => {
      prevError?.(entry);
      this.sink.emit({
        type: 'error', flowId: entry.flowId, flowName: entry.flowName,
        data: { from: entry.from, to: entry.to, trigger: entry.trigger, cause: entry.cause?.message, durationMicros: entry.durationMicros },
        timestamp: new Date(),
      });
    });
    engine.setGuardLogger((entry: GuardLogEntry) => {
      prevGuard?.(entry);
      this.sink.emit({
        type: 'guard', flowId: entry.flowId, flowName: entry.flowName,
        data: { state: entry.state, guardName: entry.guardName, result: entry.result, reason: entry.reason, durationMicros: entry.durationMicros },
        timestamp: new Date(),
      });
    });
  }
}
