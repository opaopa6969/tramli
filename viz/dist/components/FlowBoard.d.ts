import '@xyflow/react/dist/style.css';
import type { FlowDefinitionInfo, VizEvent } from '../types';
import type { TransitAnimation } from '../hooks/useVizSocket';
interface FlowBoardProps {
    flows: FlowDefinitionInfo[];
    flowPositions: Map<string, string>;
    flowOwner: Map<string, string>;
    transits: TransitAnimation[];
    events: VizEvent[];
    edgeCounts: Map<string, number>;
    nodeCounts: Map<string, number>;
    edgeHeat: Map<string, number>;
    selectedFlowId: string | null;
    onSelectFlow: (flowId: string) => void;
    traceMode: boolean;
    fadeAfterMs: number;
}
export declare function FlowBoard({ flows, flowPositions, flowOwner, transits, events, edgeCounts, nodeCounts, edgeHeat, selectedFlowId, onSelectFlow, traceMode, fadeAfterMs }: FlowBoardProps): import("react/jsx-runtime").JSX.Element;
export {};
