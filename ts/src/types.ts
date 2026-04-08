import type { FlowKey } from './flow-key.js';
import type { FlowContext } from './flow-context.js';

/** State configuration: terminal and initial flags for each state. */
export type StateConfig = { terminal: boolean; initial: boolean };

/** Guard output — discriminated union (Java: sealed interface GuardOutput). */
export type GuardOutput =
  | { type: 'accepted'; data?: Map<string, unknown> }
  | { type: 'rejected'; reason: string }
  | { type: 'expired' };

/** Transition types. */
export type TransitionType = 'auto' | 'external' | 'branch' | 'sub_flow';

/** A single transition in the flow definition. */
export interface Transition<S extends string> {
  from: S;
  to: S;
  type: TransitionType;
  processor?: StateProcessor<S>;
  guard?: TransitionGuard<S>;
  branch?: BranchProcessor<S>;
  branchTargets: Map<string, S>;
  subFlowDefinition?: import('./flow-definition.js').FlowDefinition<any>;
  exitMappings?: Map<string, S>;
  /** Per-state timeout in milliseconds. If set, resumeAndExecute checks this before guard. */
  timeout?: number;
}

/**
 * Processes a state transition.
 *
 * Processors SHOULD be fast and avoid external I/O.
 * If a processor throws, the engine restores context and routes to error transition.
 */
export interface StateProcessor<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  produces: FlowKey<unknown>[];
  process(ctx: FlowContext): Promise<void> | void;
}

/**
 * Guards an external transition. Pure function — must not mutate FlowContext.
 *
 * TTL vs GuardOutput.expired: FlowInstance TTL is checked at resumeAndExecute
 * entry (flow-level). GuardOutput 'expired' is guard-level for business logic.
 */
export interface TransitionGuard<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  produces: FlowKey<unknown>[];
  maxRetries: number;
  validate(ctx: FlowContext): Promise<GuardOutput> | GuardOutput;
}

/** Decides which branch to take based on FlowContext state. */
export interface BranchProcessor<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  decide(ctx: FlowContext): Promise<string> | string;
}

/**
 * Persistence contract for flow instances.
 *
 * Threading: FlowEngine assumes single-threaded access per flow instance.
 * Atomicity: create/save and recordTransition form a logical unit.
 * If partial writes occur, save is authoritative over the transition log.
 */
export interface FlowStore {
  create(flow: unknown): void | Promise<void>;
  loadForUpdate<S extends string>(flowId: string): unknown | undefined | Promise<unknown | undefined>;
  save(flow: unknown): void | Promise<void>;
  recordTransition(flowId: string, from: string | null, to: string, trigger: string, ctx: FlowContext): void | Promise<void>;
}
