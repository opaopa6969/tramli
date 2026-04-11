import type { NodeProps } from '@xyflow/react';
export interface FlowNodeData {
    label: string;
    initial: boolean;
    terminal: boolean;
    count: number;
    throughput: number;
}
declare function FlowNodeComponent({ data }: NodeProps): import("react/jsx-runtime").JSX.Element;
export declare const FlowNode: import("react").MemoExoticComponent<typeof FlowNodeComponent>;
export {};
