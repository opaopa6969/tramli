import type { FlowDefinition } from './flow-definition.js';
import type { FlowKey } from './flow-key.js';
import type { StateProcessor } from './types.js';
import type { FlowContext } from './flow-context.js';

export interface NodeInfo<S extends string> {
  name: string;
  fromState: S;
  toState: S;
  kind: 'processor' | 'guard' | 'branch' | 'initial';
}

/**
 * Bipartite graph of data types (FlowKey) and processors/guards.
 * Built automatically during FlowDefinition.build().
 */
export class DataFlowGraph<S extends string> {
  private readonly _availableAtState: Map<S, Set<string>>;
  private readonly _producers: Map<string, NodeInfo<S>[]>;
  private readonly _consumers: Map<string, NodeInfo<S>[]>;
  private readonly _allProduced: Set<string>;
  private readonly _allConsumed: Set<string>;

  private constructor(
    availableAtState: Map<S, Set<string>>,
    producers: Map<string, NodeInfo<S>[]>,
    consumers: Map<string, NodeInfo<S>[]>,
    allProduced: Set<string>,
    allConsumed: Set<string>,
  ) {
    this._availableAtState = availableAtState;
    this._producers = producers;
    this._consumers = consumers;
    this._allProduced = allProduced;
    this._allConsumed = allConsumed;
  }

  /** Data types available in context when the flow reaches the given state. */
  availableAt(state: S): Set<string> {
    return this._availableAtState.get(state) ?? new Set();
  }

  /** Processors/guards that produce the given type. */
  producersOf(key: FlowKey<unknown>): NodeInfo<S>[] {
    return this._producers.get(key) ?? [];
  }

  /** Processors/guards that consume (require) the given type. */
  consumersOf(key: FlowKey<unknown>): NodeInfo<S>[] {
    return this._consumers.get(key) ?? [];
  }

  /** Types produced but never required by any downstream processor/guard. */
  deadData(): Set<string> {
    const dead = new Set(this._allProduced);
    for (const c of this._allConsumed) dead.delete(c);
    return dead;
  }

  /** Data lifetime: which states a type is first produced and last consumed. */
  lifetime(key: FlowKey<unknown>): { firstProduced: S; lastConsumed: S } | null {
    const prods = this._producers.get(key);
    const cons = this._consumers.get(key);
    if (!prods || prods.length === 0) return null;
    const firstProduced = prods[0].toState;
    const lastConsumed = cons && cons.length > 0 ? cons[cons.length - 1].fromState : firstProduced;
    return { firstProduced, lastConsumed };
  }

  /** Context pruning hints: for each state, types available but not required at that state. */
  pruningHints(): Map<S, Set<string>> {
    const consumedAt = new Map<S, Set<string>>();
    for (const [typeName, nodes] of this._consumers) {
      for (const node of nodes) {
        if (!consumedAt.has(node.fromState)) consumedAt.set(node.fromState, new Set());
        consumedAt.get(node.fromState)!.add(typeName);
      }
    }
    const hints = new Map<S, Set<string>>();
    for (const [state, available] of this._availableAtState) {
      const needed = consumedAt.get(state) ?? new Set();
      const prunable = new Set<string>();
      for (const type of available) {
        if (!needed.has(type)) prunable.add(type);
      }
      if (prunable.size > 0) hints.set(state, prunable);
    }
    return hints;
  }

  /**
   * Check if processor B can replace processor A without breaking data-flow.
   * B is compatible with A if: B requires no more than A, and B produces at least what A produces.
   */
  static isCompatible<S extends string>(
    a: { requires: FlowKey<unknown>[]; produces: FlowKey<unknown>[] },
    b: { requires: FlowKey<unknown>[]; produces: FlowKey<unknown>[] },
  ): boolean {
    const aReqs = new Set(a.requires as string[]);
    const bReqs = new Set(b.requires as string[]);
    const aProds = new Set(a.produces as string[]);
    const bProds = new Set(b.produces as string[]);
    for (const r of bReqs) { if (!aReqs.has(r)) return false; }
    for (const p of aProds) { if (!bProds.has(p)) return false; }
    return true;
  }

  /**
   * Verify a processor's declared requires/produces against actual context usage.
   * Returns list of violations (empty = OK).
   */
  static async verifyProcessor<S extends string>(
    processor: StateProcessor<S>, ctx: FlowContext,
  ): Promise<string[]> {
    const violations: string[] = [];
    for (const req of processor.requires) {
      if (!ctx.has(req)) violations.push(`requires ${req} but not in context`);
    }
    const beforeKeys = new Set<string>();
    for (const req of processor.requires) { if (ctx.has(req)) beforeKeys.add(req as string); }
    // Capture all existing keys
    const snapshot = ctx.snapshot();
    const existingKeys = new Set(snapshot.keys());

    try {
      await processor.process(ctx);
    } catch (e: any) {
      violations.push(`threw ${e.constructor.name}: ${e.message}`);
      return violations;
    }
    const afterSnapshot = ctx.snapshot();
    for (const prod of processor.produces) {
      if (!afterSnapshot.has(prod as string)) violations.push(`declares produces ${prod} but did not put it`);
    }
    for (const [key] of afterSnapshot) {
      if (!existingKeys.has(key) && !(processor.produces as string[]).includes(key)) {
        violations.push(`put ${key} but did not declare it in produces`);
      }
    }
    return violations;
  }

  /** All type nodes in the graph. */
  allTypes(): Set<string> {
    const types = new Set(this._allProduced);
    for (const c of this._allConsumed) types.add(c);
    return types;
  }

  /**
   * Assert that a flow instance's context satisfies the data-flow invariant.
   * Returns list of missing type keys (empty = OK).
   */
  assertDataFlow(ctx: FlowContext, currentState: S): string[] {
    const missing: string[] = [];
    for (const type of this.availableAt(currentState)) {
      if (!ctx.has(type as FlowKey<unknown>)) missing.push(type);
    }
    return missing;
  }

  /** Generate Mermaid data-flow diagram. */
  toMermaid(): string {
    const lines: string[] = ['flowchart LR'];
    const seen = new Set<string>();

    for (const [typeName, nodes] of this._producers) {
      for (const node of nodes) {
        const edge = `${node.name} -->|produces| ${typeName}`;
        if (!seen.has(edge)) { seen.add(edge); lines.push(`    ${edge}`); }
      }
    }
    for (const [typeName, nodes] of this._consumers) {
      for (const node of nodes) {
        const edge = `${typeName} -->|requires| ${node.name}`;
        if (!seen.has(edge)) { seen.add(edge); lines.push(`    ${edge}`); }
      }
    }
    return lines.join('\n') + '\n';
  }

  // ─── Builder ─────────────────────────────────────────────

  static build<S extends string>(
    def: FlowDefinition<S>, initiallyAvailable: string[],
  ): DataFlowGraph<S> {
    const stateAvail = new Map<S, Set<string>>();
    const producers = new Map<string, NodeInfo<S>[]>();
    const consumers = new Map<string, NodeInfo<S>[]>();
    const allProduced = new Set<string>(initiallyAvailable);
    const allConsumed = new Set<string>();

    if (def.initialState) {
      traverse(def, def.initialState, new Set(initiallyAvailable),
        stateAvail, producers, consumers, allProduced, allConsumed);

      // Mark initially available types as produced by "initial"
      for (const key of initiallyAvailable) {
        if (!producers.has(key)) producers.set(key, []);
        producers.get(key)!.push({
          name: 'initial', fromState: def.initialState, toState: def.initialState, kind: 'initial',
        });
      }
    }

    return new DataFlowGraph(stateAvail, producers, consumers, allProduced, allConsumed);
  }
}

function traverse<S extends string>(
  def: FlowDefinition<S>, state: S, available: Set<string>,
  stateAvail: Map<S, Set<string>>,
  producers: Map<string, NodeInfo<S>[]>,
  consumers: Map<string, NodeInfo<S>[]>,
  allProduced: Set<string>, allConsumed: Set<string>,
): void {
  if (stateAvail.has(state)) {
    const existing = stateAvail.get(state)!;
    let isSubset = true;
    for (const a of available) { if (!existing.has(a)) { isSubset = false; break; } }
    if (isSubset) return;
    for (const a of [...existing]) { if (!available.has(a)) existing.delete(a); }
  } else {
    stateAvail.set(state, new Set(available));
  }

  for (const t of def.transitionsFrom(state)) {
    const newAvail = new Set(stateAvail.get(state)!);

    if (t.guard) {
      for (const req of t.guard.requires) {
        addTo(consumers, req, { name: t.guard.name, fromState: t.from, toState: t.to, kind: 'guard' });
        allConsumed.add(req);
      }
      for (const prod of t.guard.produces) {
        addTo(producers, prod, { name: t.guard.name, fromState: t.from, toState: t.to, kind: 'guard' });
        allProduced.add(prod);
        newAvail.add(prod);
      }
    }
    if (t.branch) {
      for (const req of t.branch.requires) {
        addTo(consumers, req, { name: t.branch.name, fromState: t.from, toState: t.to, kind: 'branch' });
        allConsumed.add(req);
      }
    }
    if (t.processor) {
      for (const req of t.processor.requires) {
        addTo(consumers, req, { name: t.processor.name, fromState: t.from, toState: t.to, kind: 'processor' });
        allConsumed.add(req);
      }
      for (const prod of t.processor.produces) {
        addTo(producers, prod, { name: t.processor.name, fromState: t.from, toState: t.to, kind: 'processor' });
        allProduced.add(prod);
        newAvail.add(prod);
      }
    }

    traverse(def, t.to, newAvail, stateAvail, producers, consumers, allProduced, allConsumed);
  }
}

function addTo<S extends string>(map: Map<string, NodeInfo<S>[]>, key: string, info: NodeInfo<S>): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(info);
}
