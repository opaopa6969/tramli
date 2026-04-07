import type { FlowDefinition } from './flow-definition.js';
import type { FlowKey } from './flow-key.js';

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

  /** All type nodes in the graph. */
  allTypes(): Set<string> {
    const types = new Set(this._allProduced);
    for (const c of this._allConsumed) types.add(c);
    return types;
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
