import type { FlowDefinition, FlowEngine } from '@unlaxer/tramli';
/** Plugin kind classification. */
export type PluginKind = 'ANALYSIS' | 'STORE' | 'ENGINE' | 'RUNTIME_ADAPTER' | 'GENERATION' | 'DOCUMENTATION';
/** Plugin descriptor. */
export interface PluginDescriptor {
    id: string;
    displayName: string;
    description: string;
}
/** Base plugin interface. */
export interface FlowPlugin {
    descriptor(): PluginDescriptor;
    kind(): PluginKind;
    id?(): string;
}
/** Analysis plugin — static analysis of FlowDefinition. */
export interface AnalysisPlugin<S extends string> extends FlowPlugin {
    analyze(definition: FlowDefinition<S>, report: PluginReport): void;
}
/** Store plugin — wraps FlowStore with additional behavior. */
export interface StorePlugin extends FlowPlugin {
    wrapStore(store: any): any;
}
/** Engine plugin — installs hooks on FlowEngine. */
export interface EnginePlugin extends FlowPlugin {
    install(engine: FlowEngine): void;
}
/** Runtime adapter plugin — binds FlowEngine to return richer API. */
export interface RuntimeAdapterPlugin<R> extends FlowPlugin {
    bind(engine: FlowEngine): R;
}
/** Generation plugin — generates output from input. */
export interface GenerationPlugin<I, O> extends FlowPlugin {
    generate(input: I): O;
}
/** Documentation plugin — generates string documentation. */
export interface DocumentationPlugin<I> extends GenerationPlugin<I, string> {
}
/** Describes where in a flow definition a finding is located. */
export type FindingLocation = {
    type: 'transition';
    fromState: string;
    toState: string;
} | {
    type: 'state';
    state: string;
} | {
    type: 'data';
    dataKey: string;
} | {
    type: 'flow';
};
/** A single analysis finding. */
export interface FindingEntry {
    pluginId: string;
    severity: string;
    message: string;
    location?: FindingLocation;
}
/** Plugin report — collects analysis findings. */
export declare class PluginReport {
    private entries;
    add(pluginId: string, severity: string, message: string): void;
    warn(pluginId: string, message: string): void;
    error(pluginId: string, message: string): void;
    warnAt(pluginId: string, message: string, location: FindingLocation): void;
    errorAt(pluginId: string, message: string, location: FindingLocation): void;
    asText(): string;
    findings(): FindingEntry[];
}
