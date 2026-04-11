"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateSpec = stateSpec;
exports.transitionSpec = transitionSpec;
exports.flowSpec = flowSpec;
function stateSpec(name, opts) {
    return {
        name,
        initial: opts?.initial ?? false,
        terminal: opts?.terminal ?? false,
        entryProduces: [],
        exitProduces: [],
        children: [],
    };
}
function transitionSpec(from, to, trigger) {
    return { from, to, trigger, requires: [], produces: [] };
}
function flowSpec(flowName, enumName) {
    return { flowName, enumName, rootStates: [], transitions: [] };
}
