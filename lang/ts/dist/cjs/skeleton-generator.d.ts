import type { FlowDefinition } from './flow-definition.js';
export type TargetLanguage = 'java' | 'typescript' | 'rust';
/**
 * Generates Processor skeleton code from a FlowDefinition's requires/produces contracts.
 */
export declare class SkeletonGenerator {
    static generate<S extends string>(def: FlowDefinition<S>, lang: TargetLanguage): string;
    private static genProcessor;
    private static genGuard;
}
