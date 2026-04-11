import type { FlowDefinition } from './flow-definition.js';
import type { FlowContext } from './flow-context.js';
export declare class FlowInstance<S extends string> {
    readonly id: string;
    readonly sessionId: string;
    readonly definition: FlowDefinition<S>;
    readonly context: FlowContext;
    private _currentState;
    private _guardFailureCount;
    private _version;
    readonly createdAt: Date;
    readonly expiresAt: Date;
    private _exitState;
    private _activeSubFlow;
    constructor(id: string, sessionId: string, definition: FlowDefinition<S>, context: FlowContext, currentState: S, expiresAt: Date);
    /**
     * Restore a FlowInstance from persisted state.
     * Used by FlowStore implementations to reconstruct instances loaded from storage.
     */
    static restore<S extends string>(id: string, sessionId: string, definition: FlowDefinition<S>, context: FlowContext, currentState: S, createdAt: Date, expiresAt: Date, guardFailureCount: number, version: number, exitState: string | null): FlowInstance<S>;
    get currentState(): S;
    get guardFailureCount(): number;
    get version(): number;
    get exitState(): string | null;
    get isCompleted(): boolean;
    get activeSubFlow(): FlowInstance<any> | null;
    /** State path from root to deepest active sub-flow. */
    statePath(): string[];
    /** State path as slash-separated string. */
    statePathString(): string;
    /** Data types available in context at current state (from data-flow graph). */
    availableData(): Set<string>;
    /** Data types that the next transition requires but are not yet in context. */
    missingFor(): string[];
    /** Types required by the next external transition (including in active sub-flows). */
    waitingFor(): string[];
    /** Return a copy with the given version. For FlowStore optimistic locking. */
    withVersion(newVersion: number): FlowInstance<S>;
    /** @internal */ transitionTo(state: S): void;
    /** @internal */ incrementGuardFailure(): void;
    /** @internal */ complete(exitState: string): void;
    /** @internal */ setVersion(version: number): void;
    /** @internal */ setActiveSubFlow(sub: FlowInstance<any> | null): void;
}
