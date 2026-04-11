/**
 * Bipartite graph of data types (FlowKey) and processors/guards.
 * Built automatically during FlowDefinition.build().
 */
export class DataFlowGraph {
    _availableAtState;
    _producers;
    _consumers;
    _allProduced;
    _allConsumed;
    constructor(availableAtState, producers, consumers, allProduced, allConsumed) {
        this._availableAtState = availableAtState;
        this._producers = producers;
        this._consumers = consumers;
        this._allProduced = allProduced;
        this._allConsumed = allConsumed;
    }
    /** Data types available in context when the flow reaches the given state. */
    availableAt(state) {
        return this._availableAtState.get(state) ?? new Set();
    }
    /** Processors/guards that produce the given type. */
    producersOf(key) {
        return this._producers.get(key) ?? [];
    }
    /** Processors/guards that consume (require) the given type. */
    consumersOf(key) {
        return this._consumers.get(key) ?? [];
    }
    /** Types produced but never required by any downstream processor/guard. */
    deadData() {
        const dead = new Set(this._allProduced);
        for (const c of this._allConsumed)
            dead.delete(c);
        return dead;
    }
    /** Data lifetime: which states a type is first produced and last consumed. */
    lifetime(key) {
        const prods = this._producers.get(key);
        const cons = this._consumers.get(key);
        if (!prods || prods.length === 0)
            return null;
        const firstProduced = prods[0].toState;
        const lastConsumed = cons && cons.length > 0 ? cons[cons.length - 1].fromState : firstProduced;
        return { firstProduced, lastConsumed };
    }
    /** Context pruning hints: for each state, types available but not required at that state. */
    pruningHints() {
        const consumedAt = new Map();
        for (const [typeName, nodes] of this._consumers) {
            for (const node of nodes) {
                if (!consumedAt.has(node.fromState))
                    consumedAt.set(node.fromState, new Set());
                consumedAt.get(node.fromState).add(typeName);
            }
        }
        const hints = new Map();
        for (const [state, available] of this._availableAtState) {
            const needed = consumedAt.get(state) ?? new Set();
            const prunable = new Set();
            for (const type of available) {
                if (!needed.has(type))
                    prunable.add(type);
            }
            if (prunable.size > 0)
                hints.set(state, prunable);
        }
        return hints;
    }
    /**
     * Check if processor B can replace processor A without breaking data-flow.
     * B is compatible with A if: B requires no more than A, and B produces at least what A produces.
     */
    static isCompatible(a, b) {
        const aReqs = new Set(a.requires);
        const bReqs = new Set(b.requires);
        const aProds = new Set(a.produces);
        const bProds = new Set(b.produces);
        for (const r of bReqs) {
            if (!aReqs.has(r))
                return false;
        }
        for (const p of aProds) {
            if (!bProds.has(p))
                return false;
        }
        return true;
    }
    /**
     * Verify a processor's declared requires/produces against actual context usage.
     * Returns list of violations (empty = OK).
     */
    static async verifyProcessor(processor, ctx) {
        const violations = [];
        for (const req of processor.requires) {
            if (!ctx.has(req))
                violations.push(`requires ${req} but not in context`);
        }
        const beforeKeys = new Set();
        for (const req of processor.requires) {
            if (ctx.has(req))
                beforeKeys.add(req);
        }
        // Capture all existing keys
        const snapshot = ctx.snapshot();
        const existingKeys = new Set(snapshot.keys());
        try {
            await processor.process(ctx);
        }
        catch (e) {
            violations.push(`threw ${e.constructor.name}: ${e.message}`);
            return violations;
        }
        const afterSnapshot = ctx.snapshot();
        for (const prod of processor.produces) {
            if (!afterSnapshot.has(prod))
                violations.push(`declares produces ${prod} but did not put it`);
        }
        for (const [key] of afterSnapshot) {
            if (!existingKeys.has(key) && !processor.produces.includes(key)) {
                violations.push(`put ${key} but did not declare it in produces`);
            }
        }
        return violations;
    }
    /** All type nodes in the graph. */
    allTypes() {
        const types = new Set(this._allProduced);
        for (const c of this._allConsumed)
            types.add(c);
        return types;
    }
    /**
     * Assert that a flow instance's context satisfies the data-flow invariant.
     * Returns list of missing type keys (empty = OK).
     */
    assertDataFlow(ctx, currentState) {
        const missing = [];
        for (const type of this.availableAt(currentState)) {
            if (!ctx.has(type))
                missing.push(type);
        }
        return missing;
    }
    /** Impact analysis: all producers and consumers of a given type. */
    impactOf(key) {
        return { producers: this.producersOf(key), consumers: this.consumersOf(key) };
    }
    /** Parallelism hints: pairs of processors with no data dependency. */
    parallelismHints() {
        const allNodes = new Set();
        for (const nodes of this._producers.values())
            for (const n of nodes)
                allNodes.add(n.name);
        for (const nodes of this._consumers.values())
            for (const n of nodes)
                allNodes.add(n.name);
        const list = [...allNodes];
        const hints = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const aProds = new Set(), bReqs = new Set();
                const bProds = new Set(), aReqs = new Set();
                for (const [t, ns] of this._producers) {
                    for (const n of ns) {
                        if (n.name === list[i])
                            aProds.add(t);
                        if (n.name === list[j])
                            bProds.add(t);
                    }
                }
                for (const [t, ns] of this._consumers) {
                    for (const n of ns) {
                        if (n.name === list[i])
                            aReqs.add(t);
                        if (n.name === list[j])
                            bReqs.add(t);
                    }
                }
                const aDepB = [...aReqs].some(r => bProds.has(r));
                const bDepA = [...bReqs].some(r => aProds.has(r));
                if (!aDepB && !bDepA)
                    hints.push([list[i], list[j]]);
            }
        }
        return hints;
    }
    /** Structured JSON representation. */
    toJson() {
        const types = [...this.allTypes()].map(t => {
            const entry = { name: t };
            const prods = this.producersOf(t);
            if (prods.length)
                entry.producers = prods.map(p => p.name);
            const cons = this.consumersOf(t);
            if (cons.length)
                entry.consumers = cons.map(c => c.name);
            return entry;
        });
        return JSON.stringify({ types, deadData: [...this.deadData()] }, null, 2);
    }
    /** Generate Mermaid data-flow diagram. */
    toMermaid() {
        const lines = ['flowchart LR'];
        const seen = new Set();
        for (const [typeName, nodes] of this._producers) {
            for (const node of nodes) {
                const edge = `${node.name} -->|produces| ${typeName}`;
                if (!seen.has(edge)) {
                    seen.add(edge);
                    lines.push(`    ${edge}`);
                }
            }
        }
        for (const [typeName, nodes] of this._consumers) {
            for (const node of nodes) {
                const edge = `${typeName} -->|requires| ${node.name}`;
                if (!seen.has(edge)) {
                    seen.add(edge);
                    lines.push(`    ${edge}`);
                }
            }
        }
        return lines.join('\n') + '\n';
    }
    /** Recommended migration order: processors sorted by dependency (fewest first). */
    migrationOrder() {
        const nodeReqs = new Map();
        const nodeProds = new Map();
        for (const [t, ns] of this._consumers)
            for (const n of ns) {
                if (!nodeReqs.has(n.name))
                    nodeReqs.set(n.name, new Set());
                nodeReqs.get(n.name).add(t);
            }
        for (const [t, ns] of this._producers)
            for (const n of ns) {
                if (!nodeProds.has(n.name))
                    nodeProds.set(n.name, new Set());
                nodeProds.get(n.name).add(t);
            }
        const order = [];
        const available = new Set();
        for (const [t, ns] of this._producers) {
            if (ns.some(n => n.name === 'initial'))
                available.add(t);
        }
        const remaining = new Set([...nodeReqs.keys(), ...nodeProds.keys()]);
        remaining.delete('initial');
        while (remaining.size > 0) {
            let next = null;
            for (const name of remaining) {
                const reqs = nodeReqs.get(name) ?? new Set();
                if ([...reqs].every(r => available.has(r))) {
                    next = name;
                    break;
                }
            }
            if (!next) {
                order.push(...remaining);
                break;
            }
            order.push(next);
            remaining.delete(next);
            for (const p of nodeProds.get(next) ?? [])
                available.add(p);
        }
        return order;
    }
    /** Generate Markdown migration checklist. */
    toMarkdown() {
        const lines = ['# Migration Checklist\n'];
        const order = this.migrationOrder();
        for (let i = 0; i < order.length; i++) {
            const name = order[i];
            const reqs = [];
            for (const [t, ns] of this._consumers)
                if (ns.some(n => n.name === name))
                    reqs.push(t);
            const prods = [];
            for (const [t, ns] of this._producers)
                if (ns.some(n => n.name === name))
                    prods.push(t);
            let line = `- [ ] **${i + 1}. ${name}**`;
            if (reqs.length)
                line += `  requires: [${reqs.join(', ')}]`;
            if (prods.length)
                line += `  produces: [${prods.join(', ')}]`;
            lines.push(line);
        }
        const dead = this.deadData();
        if (dead.size > 0) {
            lines.push('\n## Dead Data\n');
            for (const d of dead)
                lines.push(`- ${d}`);
        }
        return lines.join('\n') + '\n';
    }
    /** Test scaffold: for each processor, list required type names. */
    testScaffold() {
        const scaffold = new Map();
        for (const [typeName, nodes] of this._consumers) {
            for (const node of nodes) {
                if (!scaffold.has(node.name))
                    scaffold.set(node.name, []);
                scaffold.get(node.name).push(typeName);
            }
        }
        return scaffold;
    }
    /** Generate data-flow invariant assertions as strings. */
    generateInvariantAssertions() {
        const assertions = [];
        for (const [state, types] of this._availableAtState) {
            assertions.push(`At state ${state}: context must contain [${[...types].sort().join(', ')}]`);
        }
        return assertions;
    }
    // ─── Cross-flow / Versioning utilities ─────────────────────
    /** Cross-flow map: types that one flow produces and another requires. */
    static crossFlowMap(...graphs) {
        const results = [];
        for (let i = 0; i < graphs.length; i++) {
            for (let j = 0; j < graphs.length; j++) {
                if (i === j)
                    continue;
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
    static diff(before, after) {
        const beforeTypes = before.allTypes(), afterTypes = after.allTypes();
        const addedTypes = new Set([...afterTypes].filter(t => !beforeTypes.has(t)));
        const removedTypes = new Set([...beforeTypes].filter(t => !afterTypes.has(t)));
        const beforeEdges = DataFlowGraph.collectEdges(before), afterEdges = DataFlowGraph.collectEdges(after);
        const addedEdges = new Set([...afterEdges].filter(e => !beforeEdges.has(e)));
        const removedEdges = new Set([...beforeEdges].filter(e => !afterEdges.has(e)));
        return { addedTypes, removedTypes, addedEdges, removedEdges };
    }
    static collectEdges(graph) {
        const edges = new Set();
        for (const [t, ns] of graph._producers)
            for (const n of ns)
                edges.add(`${n.name} --produces--> ${t}`);
        for (const [t, ns] of graph._consumers)
            for (const n of ns)
                edges.add(`${t} --requires--> ${n.name}`);
        return edges;
    }
    /** Version compatibility: check if v1 instances can resume on v2 definition. */
    static versionCompatibility(before, after) {
        const issues = [];
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
    static build(def, initiallyAvailable) {
        const stateAvail = new Map();
        const producers = new Map();
        const consumers = new Map();
        const allProduced = new Set(initiallyAvailable);
        const allConsumed = new Set();
        if (def.initialState) {
            traverse(def, def.initialState, new Set(initiallyAvailable), stateAvail, producers, consumers, allProduced, allConsumed);
            // Mark initially available types as produced by "initial"
            for (const key of initiallyAvailable) {
                if (!producers.has(key))
                    producers.set(key, []);
                producers.get(key).push({
                    name: 'initial', fromState: def.initialState, toState: def.initialState, kind: 'initial',
                });
            }
        }
        return new DataFlowGraph(stateAvail, producers, consumers, allProduced, allConsumed);
    }
}
function traverse(def, state, available, stateAvail, producers, consumers, allProduced, allConsumed) {
    if (stateAvail.has(state)) {
        const existing = stateAvail.get(state);
        let isSubset = true;
        for (const a of available) {
            if (!existing.has(a)) {
                isSubset = false;
                break;
            }
        }
        if (isSubset)
            return;
        for (const a of [...existing]) {
            if (!available.has(a))
                existing.delete(a);
        }
    }
    else {
        stateAvail.set(state, new Set(available));
    }
    for (const t of def.transitionsFrom(state)) {
        const newAvail = new Set(stateAvail.get(state));
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
function addTo(map, key, info) {
    if (!map.has(key))
        map.set(key, []);
    map.get(key).push(info);
}
