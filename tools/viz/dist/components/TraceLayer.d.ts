import type { StateInfo, VizEvent } from '../types';
import type { TransitAnimation } from '../hooks/useVizSocket';
interface TraceLayerProps {
    states: StateInfo[];
    flowPositions: Map<string, string>;
    transits: TransitAnimation[];
    events: VizEvent[];
    selectedFlowId: string | null;
    onSelect: (flowId: string) => void;
    fadeAfterMs: number;
}
export declare function TraceLayer({ states, flowPositions, transits, events, selectedFlowId, onSelect, fadeAfterMs }: TraceLayerProps): import("react/jsx-runtime").JSX.Element;
export {};
