import type { FlowDefinition } from '@unlaxer/tramli';
import type { AnalysisPlugin, PluginDescriptor } from '../api/types.js';
import { PluginReport } from '../api/types.js';
import type { FlowPolicy } from './types.js';
export declare class PolicyLintPlugin<S extends string> implements AnalysisPlugin<S> {
    private readonly policies;
    constructor(policies: FlowPolicy<S>[]);
    static defaults<S extends string>(): PolicyLintPlugin<S>;
    descriptor(): PluginDescriptor;
    kind(): "ANALYSIS";
    analyze(definition: FlowDefinition<S>, report?: PluginReport): PluginReport;
}
