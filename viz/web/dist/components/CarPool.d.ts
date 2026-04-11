interface CarPoolProps {
    flowPositions: Map<string, string>;
    flowStarted: Map<string, number>;
    selectedFlowId: string | null;
    onSelect: (flowId: string) => void;
}
export declare function CarPool({ flowPositions, flowStarted, selectedFlowId, onSelect }: CarPoolProps): import("react/jsx-runtime").JSX.Element;
export {};
