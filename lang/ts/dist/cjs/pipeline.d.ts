import { FlowContext } from './flow-context.js';
import { FlowError } from './flow-error.js';
import type { FlowKey } from './flow-key.js';
import type { TransitionLogEntry, StateLogEntry, ErrorLogEntry } from './flow-engine.js';
export interface PipelineStep {
    name: string;
    requires: FlowKey<unknown>[];
    produces: FlowKey<unknown>[];
    process(ctx: FlowContext): Promise<void> | void;
}
export declare class PipelineException extends FlowError {
    readonly failedStep: string;
    readonly completedSteps: string[];
    readonly context: FlowContext;
    readonly cause: Error;
    constructor(failedStep: string, completedSteps: string[], context: FlowContext, cause: Error);
}
export declare class PipelineDataFlow {
    private readonly steps;
    private readonly initiallyAvailable;
    constructor(steps: PipelineStep[], initiallyAvailable: Set<string>);
    deadData(): Set<string>;
    stepOrder(): string[];
    availableAfter(stepName: string): Set<string>;
    toMermaid(): string;
}
export declare class Pipeline {
    readonly name: string;
    private readonly steps;
    private readonly _initiallyAvailable;
    private readonly _dataFlow;
    private strictMode;
    private transitionLogger?;
    private stateLogger?;
    private errorLogger?;
    private constructor();
    dataFlow(): PipelineDataFlow;
    setStrictMode(strict: boolean): void;
    setTransitionLogger(l: ((e: TransitionLogEntry) => void) | null): void;
    setStateLogger(l: ((e: StateLogEntry) => void) | null): void;
    setErrorLogger(l: ((e: ErrorLogEntry) => void) | null): void;
    removeAllLoggers(): void;
    execute(initialData: Map<string, unknown>): Promise<FlowContext>;
    asStep(): PipelineStep;
    static builder(name: string): PipelineBuilder;
}
export declare class PipelineBuilder {
    private readonly name;
    private readonly steps;
    private readonly _initiallyAvailable;
    constructor(name: string);
    initiallyAvailable(...keys: FlowKey<unknown>[]): this;
    step(s: PipelineStep): this;
    build(): Pipeline;
}
