export function stateSpec(name, opts) {
    return {
        name,
        initial: opts?.initial ?? false,
        terminal: opts?.terminal ?? false,
        entryProduces: [],
        exitProduces: [],
        children: [],
    };
}
export function transitionSpec(from, to, trigger) {
    return { from, to, trigger, requires: [], produces: [] };
}
export function flowSpec(flowName, enumName) {
    return { flowName, enumName, rootStates: [], transitions: [] };
}
