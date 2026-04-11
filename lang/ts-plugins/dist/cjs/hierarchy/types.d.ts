export interface HierarchicalStateSpec {
    name: string;
    initial: boolean;
    terminal: boolean;
    entryProduces: string[];
    exitProduces: string[];
    children: HierarchicalStateSpec[];
}
export interface HierarchicalTransitionSpec {
    from: string;
    to: string;
    trigger: string;
    requires: string[];
    produces: string[];
}
export interface HierarchicalFlowSpec {
    flowName: string;
    enumName: string;
    rootStates: HierarchicalStateSpec[];
    transitions: HierarchicalTransitionSpec[];
}
export declare function stateSpec(name: string, opts?: {
    initial?: boolean;
    terminal?: boolean;
}): HierarchicalStateSpec;
export declare function transitionSpec(from: string, to: string, trigger: string): HierarchicalTransitionSpec;
export declare function flowSpec(flowName: string, enumName: string): HierarchicalFlowSpec;
