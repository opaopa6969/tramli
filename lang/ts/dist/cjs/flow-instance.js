"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowInstance = void 0;
class FlowInstance {
    id;
    sessionId;
    definition;
    context;
    _currentState;
    _guardFailureCount;
    _guardFailureCounts = new Map();
    _version;
    createdAt;
    expiresAt;
    _exitState;
    _activeSubFlow = null;
    _lastError = null;
    _stateEnteredAt = new Date();
    constructor(id, sessionId, definition, context, currentState, expiresAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.definition = definition;
        this.context = context;
        this._currentState = currentState;
        this._guardFailureCount = 0;
        this._version = 0;
        this.createdAt = new Date();
        this.expiresAt = expiresAt;
        this._exitState = null;
    }
    /**
     * Restore a FlowInstance from persisted state.
     * Used by FlowStore implementations to reconstruct instances loaded from storage.
     */
    static restore(id, sessionId, definition, context, currentState, createdAt, expiresAt, guardFailureCount, version, exitState) {
        const instance = Object.create(FlowInstance.prototype);
        // Use defineProperties to set readonly fields
        Object.defineProperty(instance, 'id', { value: id, writable: false });
        Object.defineProperty(instance, 'sessionId', { value: sessionId, writable: false });
        Object.defineProperty(instance, 'definition', { value: definition, writable: false });
        Object.defineProperty(instance, 'context', { value: context, writable: false });
        Object.defineProperty(instance, 'createdAt', { value: createdAt, writable: false });
        Object.defineProperty(instance, 'expiresAt', { value: expiresAt, writable: false });
        instance._currentState = currentState;
        instance._guardFailureCount = guardFailureCount;
        instance._version = version;
        instance._exitState = exitState;
        return instance;
    }
    get currentState() { return this._currentState; }
    get guardFailureCount() { return this._guardFailureCount; }
    /** Guard failure count for a specific guard (by name). */
    guardFailureCountFor(guardName) { return this._guardFailureCounts.get(guardName) ?? 0; }
    get version() { return this._version; }
    get exitState() { return this._exitState; }
    get isCompleted() { return this._exitState !== null; }
    get activeSubFlow() { return this._activeSubFlow; }
    /** Last error message (set when a processor throws and error transition fires). */
    get lastError() { return this._lastError; }
    /** State path from root to deepest active sub-flow. */
    statePath() {
        const path = [this._currentState];
        if (this._activeSubFlow)
            path.push(...this._activeSubFlow.statePath());
        return path;
    }
    /** State path as slash-separated string. */
    statePathString() { return this.statePath().join('/'); }
    /** Data types available in context at current state (from data-flow graph). */
    availableData() {
        return this.definition.dataFlowGraph?.availableAt(this._currentState) ?? new Set();
    }
    /** Data types that the next transition requires but are not yet in context. */
    missingFor() {
        const missing = [];
        for (const t of this.definition.transitionsFrom(this._currentState)) {
            if (t.guard)
                for (const r of t.guard.requires) {
                    if (!this.context.has(r))
                        missing.push(r);
                }
            if (t.processor)
                for (const r of t.processor.requires) {
                    if (!this.context.has(r))
                        missing.push(r);
                }
        }
        return [...new Set(missing)];
    }
    /** Types required by the next external transition (including in active sub-flows). */
    waitingFor() {
        if (this._activeSubFlow)
            return this._activeSubFlow.waitingFor();
        const ext = this.definition.externalFrom(this._currentState);
        if (!ext?.guard)
            return [];
        return [...ext.guard.requires];
    }
    /** Return a copy with the given version. For FlowStore optimistic locking. */
    withVersion(newVersion) {
        const copy = FlowInstance.restore(this.id, this.sessionId, this.definition, this.context, this._currentState, this.createdAt, this.expiresAt, this._guardFailureCount, newVersion, this._exitState);
        copy.setActiveSubFlow(this._activeSubFlow);
        return copy;
    }
    get stateEnteredAt() { return this._stateEnteredAt; }
    /** @internal */ transitionTo(state) {
        const stateChanged = this._currentState !== state;
        this._currentState = state;
        this._stateEnteredAt = new Date();
        if (stateChanged) {
            this._guardFailureCount = 0;
            this._guardFailureCounts.clear();
        }
    }
    /** @internal */ incrementGuardFailure(guardName) {
        this._guardFailureCount++;
        if (guardName)
            this._guardFailureCounts.set(guardName, (this._guardFailureCounts.get(guardName) ?? 0) + 1);
    }
    /** @internal */ complete(exitState) { this._exitState = exitState; }
    /** @internal */ setVersion(version) { this._version = version; }
    /** @internal */ setActiveSubFlow(sub) { this._activeSubFlow = sub; }
    /** @internal */ setLastError(error) { this._lastError = error; }
}
exports.FlowInstance = FlowInstance;
