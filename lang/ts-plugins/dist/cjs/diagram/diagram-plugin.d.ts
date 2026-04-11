import type { FlowDefinition } from '@unlaxer/tramli';
import type { DiagramBundle } from './types.js';
export declare class DiagramPlugin {
    generate<S extends string>(definition: FlowDefinition<S>): DiagramBundle;
}
