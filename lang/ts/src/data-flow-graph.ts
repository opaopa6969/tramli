import type { FlowDefinition } from './flow-definition.js';
import type { FlowKey } from './flow-key.js';
import type { StateProcessor } from './types.js';
import type { FlowContext } from './flow-context.js';

/** Result of DataFlowGraph.explain(). */
export interface ExplainResult<S extends string> {
  state: S;
  available: Set<string>;
  missing: Array<{
    type: string;
    neededBy: string[];
    producers: Array<{ name: string; producedAt: S }>;
    reason: string;
  }>;
}

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

  /**
   * Explain data availability at a state. For each missing type, trace why it's unavailable.
   * If `key` is provided, explains only that type. Otherwise explains all types needed by
   * outgoing transitions from that state.
   */
  explain(state: S, key?: FlowKey<unknown>): ExplainResult<S> {
    const available = this.availableAt(state);
    const result: ExplainResult<S> = { state, available: new Set(available), missing: [] };

    // Determine which types to check
    let keysToCheck: string[];
    if (key) {
      keysToCheck = [key as string];
    } else {
      // All types required by outgoing processors/guards/branches from this state
      keysToCheck = [];
      for (const [typeName, nodes] of this._consumers) {
        if (nodes.some(n => n.fromState === state)) keysToCheck.push(typeName);
      }
    }

    for (const k of keysToCheck) {
      if (available.has(k)) continue;
      const producers = this._producers.get(k) ?? [];
      const neededBy = (this._consumers.get(k) ?? []).filter(n => n.fromState === state);
      result.missing.push({
        type: k,
        neededBy: neededBy.map(n => n.name),
        producers: producers.map(p => ({ name: p.name, producedAt: p.toState })),
        reason: producers.length === 0
          ? `'${k}' is never produced by any processor or guard`
          : `'${k}' is produced by [${producers.map(p => p.name).join(', ')}] but not on a path reaching ${state}`,
      });
    }
    return result;
  }

  /**
   * Human-readable explanation of why a type is missing at a transition.
   * Returns an array of explanation strings.
   */
  whyMissing(key: FlowKey<unknown>, state: S): string[] {
    const k = key as string;
    const available = this.availableAt(state);
    if (available.has(k)) return [`'${k}' IS available at ${state}`];

    const lines: string[] = [];
    const producers = this._producers.get(k) ?? [];
    const consumers = this._consumers.get(k) ?? [];

    if (producers.length === 0) {
      lines.push(`'${k}' is never produced — no processor or guard declares it in produces[]`);
    } else {
      lines.push(`'${k}' is produced by:`);
      for (const p of producers) {
        lines.push(`  - ${p.name} (${p.fromState} → ${p.toState})`);
      }
      lines.push(`But none of these producers are on a path that reaches ${state}`);
    }

    const neededBy = consumers.filter(c => c.fromState === state);
    if (neededBy.length > 0) {
      lines.push(`Required at ${state} by: ${neededBy.map(n => n.name).join(', ')}`);
    }

    // Show what IS available at this state
    if (available.size > 0) {
      lines.push(`Available at ${state}: [${[...available].sort().join(', ')}]`);
    }
    return lines;
  }

  /** Impact analysis: all producers and consumers of a given type. */
  impactOf(key: FlowKey<unknown>): { producers: NodeInfo<S>[]; consumers: NodeInfo<S>[] } {
    return { producers: this.producersOf(key), consumers: this.consumersOf(key) };
  }

  /** Parallelism hints: pairs of processors with no data dependency. */
  parallelismHints(): [string, string][] {
    const allNodes = new Set<string>();
    for (const nodes of this._producers.values()) for (const n of nodes) allNodes.add(n.name);
    for (const nodes of this._consumers.values()) for (const n of nodes) allNodes.add(n.name);
    const list = [...allNodes];
    const hints: [string, string][] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const aProds = new Set<string>(), bReqs = new Set<string>();
        const bProds = new Set<string>(), aReqs = new Set<string>();
        for (const [t, ns] of this._producers) { for (const n of ns) { if (n.name === list[i]) aProds.add(t); if (n.name === list[j]) bProds.add(t); } }
        for (const [t, ns] of this._consumers) { for (const n of ns) { if (n.name === list[i]) aReqs.add(t); if (n.name === list[j]) bReqs.add(t); } }
        const aDepB = [...aReqs].some(r => bProds.has(r));
        const bDepA = [...bReqs].some(r => aProds.has(r));
        if (!aDepB && !bDepA) hints.push([list[i], list[j]]);
      }
    }
    return hints;
  }

  /** Structured JSON representation. */
  toJson(): string {
    const types = [...this.allTypes()].map(t => {
      const entry: any = { name: t };
      const prods = this.producersOf(t as FlowKey<unknown>);
      if (prods.length) entry.producers = prods.map(p => p.name);
      const cons = this.consumersOf(t as FlowKey<unknown>);
      if (cons.length) entry.consumers = cons.map(c => c.name);
      return entry;
    });
    return JSON.stringify({ types, deadData: [...this.deadData()] }, null, 2);
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

  /** Recommended migration order: processors sorted by dependency (fewest first). */
  migrationOrder(): string[] {
    const nodeReqs = new Map<string, Set<string>>();
    const nodeProds = new Map<string, Set<string>>();
    for (const [t, ns] of this._consumers) for (const n of ns) { if (!nodeReqs.has(n.name)) nodeReqs.set(n.name, new Set()); nodeReqs.get(n.name)!.add(t); }
    for (const [t, ns] of this._producers) for (const n of ns) { if (!nodeProds.has(n.name)) nodeProds.set(n.name, new Set()); nodeProds.get(n.name)!.add(t); }

    const order: string[] = [];
    const available = new Set<string>();
    for (const [t, ns] of this._producers) { if (ns.some(n => n.name === 'initial')) available.add(t); }
    const remaining = new Set([...nodeReqs.keys(), ...nodeProds.keys()]);
    remaining.delete('initial');

    while (remaining.size > 0) {
      let next: string | null = null;
      for (const name of remaining) {
        const reqs = nodeReqs.get(name) ?? new Set();
        if ([...reqs].every(r => available.has(r))) { next = name; break; }
      }
      if (!next) { order.push(...remaining); break; }
      order.push(next);
      remaining.delete(next);
      for (const p of nodeProds.get(next) ?? []) available.add(p);
    }
    return order;
  }

  /** Generate Markdown migration checklist. */
  toMarkdown(): string {
    const lines = ['# Migration Checklist'];
    const order = this.migrationOrder();
    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      const reqs: string[] = [];
      for (const [t, ns] of this._consumers) if (ns.some(n => n.name === name)) reqs.push(t);
      const prods: string[] = [];
      for (const [t, ns] of this._producers) if (ns.some(n => n.name === name)) prods.push(t);
      let line = `- [ ] **${i + 1}. ${name}**`;
      if (reqs.length) line += `  requires: [${reqs.join(', ')}]`;
      if (prods.length) line += `  produces: [${prods.join(', ')}]`;
      lines.push(line);
    }
    const dead = this.deadData();
    if (dead.size > 0) {
      lines.push('', '## Dead Data');
      for (const d of dead) lines.push(`- ${d}`);
    }
    return lines.join('\n') + '\n';
  }

  /** Test scaffold: for each processor, list required type names. */
  testScaffold(): Map<string, string[]> {
    const scaffold = new Map<string, string[]>();
    for (const [typeName, nodes] of this._consumers) {
      for (const node of nodes) {
        if (!scaffold.has(node.name)) scaffold.set(node.name, []);
        scaffold.get(node.name)!.push(typeName);
      }
    }
    return scaffold;
  }

  /** Generate data-flow invariant assertions as strings. */
  generateInvariantAssertions(): string[] {
    const assertions: string[] = [];
    for (const [state, types] of this._availableAtState) {
      assertions.push(`At state ${state}: context must contain [${[...types].sort().join(', ')}]`);
    }
    return assertions;
  }

  // ─── Cross-flow / Versioning utilities ─────────────────────

  /** Cross-flow map: types that one flow produces and another requires. */
  static crossFlowMap(...graphs: DataFlowGraph<any>[]): string[] {
    const results: string[] = [];
    for (let i = 0; i < graphs.length; i++) {
      for (let j = 0; j < graphs.length; j++) {
        if (i === j) continue;
        for (const produced of graphs[i]._allProduced) {
          if (graphs[j]._allConsumed.has(produced)) {
            results.push(`${produced}: flow ${i} produces → flow ${j} consumes`);
          }
        }
      }
    }
    return results;
  }

  /** Diff two data-flow graphs. */
  static diff(before: DataFlowGraph<any>, after: DataFlowGraph<any>): {
    addedTypes: Set<string>; removedTypes: Set<string>;
    addedEdges: Set<string>; removedEdges: Set<string>;
  } {
    const beforeTypes = before.allTypes(), afterTypes = after.allTypes();
    const addedTypes = new Set([...afterTypes].filter(t => !beforeTypes.has(t)));
    const removedTypes = new Set([...beforeTypes].filter(t => !afterTypes.has(t)));
    const beforeEdges = DataFlowGraph.collectEdges(before), afterEdges = DataFlowGraph.collectEdges(after);
    const addedEdges = new Set([...afterEdges].filter(e => !beforeEdges.has(e)));
    const removedEdges = new Set([...beforeEdges].filter(e => !afterEdges.has(e)));
    return { addedTypes, removedTypes, addedEdges, removedEdges };
  }

  private static collectEdges(graph: DataFlowGraph<any>): Set<string> {
    const edges = new Set<string>();
    for (const [t, ns] of graph._producers) for (const n of ns) edges.add(`${n.name} --produces--> ${t}`);
    for (const [t, ns] of graph._consumers) for (const n of ns) edges.add(`${t} --requires--> ${n.name}`);
    return edges;
  }

  /** Version compatibility: check if v1 instances can resume on v2 definition. */
  static versionCompatibility<S extends string>(before: DataFlowGraph<S>, after: DataFlowGraph<S>): string[] {
    const issues: string[] = [];
    for (const [state, beforeAvail] of before._availableAtState) {
      const afterAvail = after._availableAtState.get(state) ?? new Set();
      for (const type of afterAvail) {
        if (!beforeAvail.has(type)) {
          issues.push(`State ${state}: v2 expects ${type} but v1 instances may not have it`);
        }
      }
    }
    return issues;
  }

  // ─── Builder ─────────────────────────────────────────────

  static build<S extends string>(
    def: FlowDefinition<S>, initiallyAvailable: string[], externallyProvided: string[] = [],
  ): DataFlowGraph<S> {
    const stateAvail = new Map<S, Set<string>>();
    const producers = new Map<string, NodeInfo<S>[]>();
    const consumers = new Map<string, NodeInfo<S>[]>();
    const allProduced = new Set<string>(initiallyAvailable);
    const allConsumed = new Set<string>();
    const extSet = new Set<string>(externallyProvided);

    if (def.initialState) {
      traverse(def, def.initialState, new Set(initiallyAvailable), extSet,
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
  def: FlowDefinition<S>, state: S, available: Set<string>, externallyProvided: Set<string>,
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
    if (t.type === 'external') {
      for (const k of externallyProvided) newAvail.add(k);
    }

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

    traverse(def, t.to, newAvail, externallyProvided, stateAvail, producers, consumers, allProduced, allConsumed);
  }
}

function addTo<S extends string>(map: Map<string, NodeInfo<S>[]>, key: string, info: NodeInfo<S>): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(info);
}
