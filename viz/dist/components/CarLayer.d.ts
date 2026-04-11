import type { StateInfo, VizEvent } from '../types';
interface CarLayerProps {
    states: StateInfo[];
    flowPositions: Map<string, string>;
    events: VizEvent[];
    selectedFlowId: string | null;
    onSelect: (flowId: string) => void;
}
export declare function CarLayer({ states, flowPositions, events, selectedFlowId, onSelect }: CarLayerProps): import("react/jsx-runtime").JSX.Element;
export {};
