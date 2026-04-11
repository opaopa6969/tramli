import type { FlowDefinition } from './flow-definition.js';
export declare class MermaidGenerator {
    static generate<S extends string>(def: FlowDefinition<S>): string;
    /** Generate Mermaid diagram highlighting external transitions and their data contracts. */
    static generateExternalContract<S extends string>(def: FlowDefinition<S>): string;
    /** Generate Mermaid data-flow diagram from requires/produces declarations. */
    static generateDataFlow<S extends string>(def: FlowDefinition<S>): string;
    private static transitionLabel;
}
