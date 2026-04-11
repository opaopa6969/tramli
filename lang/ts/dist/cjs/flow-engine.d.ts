import type { FlowDefinition } from './flow-definition.js';
import { FlowInstance } from './flow-instance.js';
import type { InMemoryFlowStore } from './in-memory-flow-store.js';
/** Default max auto-chain depth. Override via constructor options. */
export declare const DEFAULT_MAX_CHAIN_DEPTH = 10;
/** Log entry types for tramli's pluggable logger API. */
export interface TransitionLogEntry {
    flowId: string;
    flowName: string;
    from: string | null;
    to: string;
    trigger: string;
    durationMicros: number;
}
export interface StateLogEntry {
    flowId: string;
    flowName: string;
    state: string;
    key: string;
    value: unknown;
}
export interface ErrorLogEntry {
    flowId: string;
    flowName: string;
    from: string | null;
    to: string | null;
    trigger: string;
    cause: Error | null;
    durationMicros: number;
}
export interface GuardLogEntry {
    flowId: string;
    flowName: string;
    state: string;
    guardName: string;
    result: 'accepted' | 'rejected' | 'expired';
    reason?: string;
    durationMicros: number;
}
export declare class FlowEngine {
    private readonly store;
    private readonly strictMode;
    private readonly maxChainDepth;
    private transitionLogger?;
    private stateLogger?;
    private errorLogger?;
    private guardLogger?;
    constructor(store: InMemoryFlowStore, options?: {
        strictMode?: boolean;
        maxChainDepth?: number;
    });
    setTransitionLogger(logger: ((entry: TransitionLogEntry) => void) | null): void;
    setStateLogger(logger: ((entry: StateLogEntry) => void) | null): void;
    setErrorLogger(logger: ((entry: ErrorLogEntry) => void) | null): void;
    setGuardLogger(logger: ((entry: GuardLogEntry) => void) | null): void;
    getTransitionLogger(): ((entry: TransitionLogEntry) => void) | undefined;
    getStateLogger(): ((entry: StateLogEntry) => void) | undefined;
    getErrorLogger(): ((entry: ErrorLogEntry) => void) | undefined;
    getGuardLogger(): ((entry: GuardLogEntry) => void) | undefined;
    removeAllLoggers(): void;
    startFlow<S extends string>(definition: FlowDefinition<S>, sessionId: string, initialData: Map<string, unknown>): Promise<FlowInstance<S>>;
    resumeAndExecute<S extends string>(flowId: string, definition: FlowDefinition<S>, externalData?: Map<string, unknown>): Promise<FlowInstance<S>>;
    private executeAutoChain;
    private executeSubFlow;
    private resumeSubFlow;
    private verifyProduces;
    private fireEnter;
    private fireExit;
    private logTransition;
    private logError;
    private logGuard;
    private handleError;
}
