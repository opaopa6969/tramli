import type { FlowDefinition } from './flow-definition.js';
import type { FlowContext } from './flow-context.js';

export class FlowInstance<S extends string> {
  readonly id: string;
  readonly sessionId: string;
  readonly definition: FlowDefinition<S>;
  readonly context: FlowContext;
  private _currentState: S;
  private _guardFailureCount: number;
  private _version: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  private _exitState: string | null;
  private _activeSubFlow: FlowInstance<any> | null = null;

  constructor(
    id: string, sessionId: string, definition: FlowDefinition<S>,
    context: FlowContext, currentState: S, expiresAt: Date,
  ) {
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
  static restore<S extends string>(
    id: string, sessionId: string, definition: FlowDefinition<S>,
    context: FlowContext, currentState: S, createdAt: Date, expiresAt: Date,
    guardFailureCount: number, version: number, exitState: string | null,
  ): FlowInstance<S> {
    const instance = Object.create(FlowInstance.prototype) as FlowInstance<S>;
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

  get currentState(): S { return this._currentState; }
  get guardFailureCount(): number { return this._guardFailureCount; }
  get version(): number { return this._version; }
  get exitState(): string | null { return this._exitState; }
  get isCompleted(): boolean { return this._exitState !== null; }

  get activeSubFlow(): FlowInstance<any> | null { return this._activeSubFlow; }

  /** State path from root to deepest active sub-flow. */
  statePath(): string[] {
    const path: string[] = [this._currentState];
    if (this._activeSubFlow) path.push(...this._activeSubFlow.statePath());
    return path;
  }

  /** State path as slash-separated string. */
  statePathString(): string { return this.statePath().join('/'); }

  /** Types required by the next external transition (including in active sub-flows). */
  waitingFor(): string[] {
    if (this._activeSubFlow) return this._activeSubFlow.waitingFor();
    const ext = this.definition.externalFrom(this._currentState);
    if (!ext?.guard) return [];
    return [...ext.guard.requires];
  }

  /** Return a copy with the given version. For FlowStore optimistic locking. */
  withVersion(newVersion: number): FlowInstance<S> {
    const copy = FlowInstance.restore(
      this.id, this.sessionId, this.definition, this.context,
      this._currentState, this.createdAt, this.expiresAt,
      this._guardFailureCount, newVersion, this._exitState,
    );
    copy.setActiveSubFlow(this._activeSubFlow);
    return copy;
  }

  /** @internal */ transitionTo(state: S): void { this._currentState = state; }
  /** @internal */ incrementGuardFailure(): void { this._guardFailureCount++; }
  /** @internal */ complete(exitState: string): void { this._exitState = exitState; }
  /** @internal */ setVersion(version: number): void { this._version = version; }
  /** @internal */ setActiveSubFlow(sub: FlowInstance<any> | null): void { this._activeSubFlow = sub; }
}
