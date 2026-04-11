import type { FlowDefinition } from '@unlaxer/tramli';
import type { PluginReport } from '../api/types.js';
export interface FlowPolicy<S extends string> {
    (definition: FlowDefinition<S>, report: PluginReport): void;
}
