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

export function stateSpec(name: string, opts?: {
  initial?: boolean;
  terminal?: boolean;
}): HierarchicalStateSpec {
  return {
    name,
    initial: opts?.initial ?? false,
    terminal: opts?.terminal ?? false,
    entryProduces: [],
    exitProduces: [],
    children: [],
  };
}

export function transitionSpec(from: string, to: string, trigger: string): HierarchicalTransitionSpec {
  return { from, to, trigger, requires: [], produces: [] };
}

export function flowSpec(flowName: string, enumName: string): HierarchicalFlowSpec {
  return { flowName, enumName, rootStates: [], transitions: [] };
}
