import type { VizEvent, FlowDefinitionInfo, ClientMessage } from '../types';
export interface TransitAnimation {
    flowId: string;
    from: string;
    to: string;
    flowName: string;
    startedAt: number;
}
export interface VizState {
    connected: boolean;
    /** All SM definitions (multi-SM or single wrapped in array). */
    flows: FlowDefinitionInfo[];
    /** flowId → current state name */
    flowPositions: Map<string, string>;
    /** flowId → flowName (which SM this instance belongs to) */
    flowOwner: Map<string, string>;
    /** flowId → started-at timestamp */
    flowStarted: Map<string, number>;
    flowLastActive: Map<string, number>;
    events: VizEvent[];
    transits: TransitAnimation[];
    /** "flowName:from->to" → count */
    edgeCounts: Map<string, number>;
    /** "flowName:state" → count */
    nodeCounts: Map<string, number>;
    /** "flowName:from->to" → heat */
    edgeHeat: Map<string, number>;
    metrics: {
        throughput: number;
        errorRate: number;
        avgLatencyMicros: number;
    };
}
export declare const TRANSIT_DURATION = 600;
export declare function trailSecondsToDecay(seconds: number): number;
export declare function useVizSocket(url?: string): {
    state: VizState;
    send: (msg: ClientMessage) => void;
    replay: (position: number) => void;
    setHeatDecay: (seconds: number) => void;
};
