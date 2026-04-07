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

  /** @internal */ transitionTo(state: S): void { this._currentState = state; }
  /** @internal */ incrementGuardFailure(): void { this._guardFailureCount++; }
  /** @internal */ complete(exitState: string): void { this._exitState = exitState; }
  /** @internal */ setVersion(version: number): void { this._version = version; }
}
