import type { FlowEngine } from '@unlaxer/tramli';
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
export declare class InMemoryTelemetrySink implements TelemetrySink {
    private log;
    emit(event: TelemetryEvent): void;
    events(): readonly TelemetryEvent[];
}
export declare class ObservabilityEnginePlugin implements EnginePlugin {
    private readonly sink;
    constructor(sink: TelemetrySink);
    descriptor(): PluginDescriptor;
    kind(): "ENGINE";
    install(engine: FlowEngine, options?: {
        append?: boolean;
    }): void;
}
