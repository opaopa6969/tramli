import { FlowError } from './flow-error.js';
import { DataFlowGraph } from './data-flow-graph.js';
export class FlowDefinition {
    name;
    stateConfig;
    ttl; // milliseconds
    maxGuardRetries;
    transitions;
    errorTransitions;
    initialState;
    terminalStates;
    dataFlowGraph;
    constructor(name, stateConfig, ttl, maxGuardRetries, transitions, errorTransitions) {
        this.name = name;
        this.stateConfig = stateConfig;
        this.ttl = ttl;
        this.maxGuardRetries = maxGuardRetries;
        this.transitions = [...transitions];
        this.errorTransitions = new Map(errorTransitions);
        let initial = null;
        const terminals = new Set();
        for (const [state, cfg] of Object.entries(stateConfig)) {
            if (cfg.initial)
                initial = state;
            if (cfg.terminal)
                terminals.add(state);
        }
        this.initialState = initial;
        this.terminalStates = terminals;
    }
    transitionsFrom(state) {
        return this.transitions.filter(t => t.from === state);
    }
    externalFrom(state) {
        return this.transitions.find(t => t.from === state && t.type === 'external');
    }
    allStates() {
        return Object.keys(this.stateConfig);
    }
    /**
     * Create a new FlowDefinition with a sub-flow inserted before a specific transition.
     */
    withPlugin(from, to, pluginFlow) {
        const newTransitions = [];
        let replaced = false;
        for (const t of this.transitions) {
            if (t.from === from && t.to === to && !replaced) {
                const exitMap = new Map();
                for (const terminal of pluginFlow.terminalStates)
                    exitMap.set(terminal, to);
                newTransitions.push({
                    from, to: from, type: 'sub_flow',
                    processor: t.processor, guard: undefined, branch: undefined,
                    branchTargets: new Map(),
                    subFlowDefinition: pluginFlow, exitMappings: exitMap,
                });
                replaced = true;
            }
            else {
                newTransitions.push(t);
            }
        }
        const result = Object.create(FlowDefinition.prototype);
        Object.assign(result, {
            name: this.name + '+plugin:' + pluginFlow.name,
            stateConfig: this.stateConfig, ttl: this.ttl,
            maxGuardRetries: this.maxGuardRetries,
            transitions: newTransitions,
            errorTransitions: new Map(this.errorTransitions),
            initialState: this.initialState,
            terminalStates: this.terminalStates,
            dataFlowGraph: this.dataFlowGraph, // reuse parent's graph
        });
        return result;
    }
    // ─── Builder ─────────────────────────────────────────────
    static builder(name, stateConfig) {
        return new Builder(name, stateConfig);
    }
}
export class Builder {
    name;
    stateConfig;
    ttl = 5 * 60 * 1000; // 5 minutes
    maxGuardRetries = 3;
    transitions = [];
    errorTransitions = new Map();
    initiallyAvailableKeys = [];
    constructor(name, stateConfig) {
        this.name = name;
        this.stateConfig = stateConfig;
    }
    initiallyAvailable(...keys) {
        for (const k of keys)
            this.initiallyAvailableKeys.push(k);
        return this;
    }
    setTtl(ms) { this.ttl = ms; return this; }
    setMaxGuardRetries(max) { this.maxGuardRetries = max; return this; }
    from(state) {
        return new FromBuilder(this, state);
    }
    onError(from, to) {
        this.errorTransitions.set(from, to);
        return this;
    }
    onAnyError(errorState) {
        for (const s of Object.keys(this.stateConfig)) {
            if (!this.stateConfig[s].terminal)
                this.errorTransitions.set(s, errorState);
        }
        return this;
    }
    /** @internal */
    addTransition(t) { this.transitions.push(t); }
    build() {
        const def = FlowDefinition.builder(this.name, this.stateConfig);
        // Build via private constructor
        const result = Object.create(FlowDefinition.prototype);
        Object.assign(result, {
            name: this.name,
            stateConfig: this.stateConfig,
            ttl: this.ttl,
            maxGuardRetries: this.maxGuardRetries,
            transitions: [...this.transitions],
            errorTransitions: new Map(this.errorTransitions),
        });
        // Compute initial/terminal
        let initial = null;
        const terminals = new Set();
        for (const [state, cfg] of Object.entries(this.stateConfig)) {
            if (cfg.initial)
                initial = state;
            if (cfg.terminal)
                terminals.add(state);
        }
        result.initialState = initial;
        result.terminalStates = terminals;
        result.dataFlowGraph = null;
        this.validate(result);
        result.dataFlowGraph = DataFlowGraph.build(result, this.initiallyAvailableKeys);
        return result;
    }
    validate(def) {
        const errors = [];
        if (!def.initialState) {
            errors.push('No initial state found (exactly one state must have initial=true)');
        }
        this.checkReachability(def, errors);
        this.checkPathToTerminal(def, errors);
        this.checkDag(def, errors);
        this.checkExternalUniqueness(def, errors);
        this.checkBranchCompleteness(def, errors);
        this.checkRequiresProduces(def, errors);
        this.checkAutoExternalConflict(def, errors);
        this.checkTerminalNoOutgoing(def, errors);
        this.checkSubFlowExitCompleteness(def, errors);
        this.checkSubFlowNestingDepth(def, errors, 0);
        this.checkSubFlowCircularRef(def, errors, new Set());
        if (errors.length > 0) {
            throw new FlowError('INVALID_FLOW_DEFINITION', `Flow '${this.name}' has ${errors.length} validation error(s):\n  - ${errors.join('\n  - ')}`);
        }
    }
    checkReachability(def, errors) {
        if (!def.initialState)
            return;
        const visited = new Set();
        const queue = [def.initialState];
        visited.add(def.initialState);
        while (queue.length > 0) {
            const current = queue.shift();
            for (const t of def.transitionsFrom(current)) {
                if (t.type === 'sub_flow' && t.exitMappings) {
                    for (const target of t.exitMappings.values()) {
                        if (!visited.has(target)) {
                            visited.add(target);
                            queue.push(target);
                        }
                    }
                    continue;
                }
                if (!visited.has(t.to)) {
                    visited.add(t.to);
                    queue.push(t.to);
                }
            }
            const errTarget = def.errorTransitions.get(current);
            if (errTarget && !visited.has(errTarget)) {
                visited.add(errTarget);
                queue.push(errTarget);
            }
        }
        for (const s of def.allStates()) {
            if (!visited.has(s) && !def.stateConfig[s].terminal) {
                errors.push(`State ${s} is not reachable from ${def.initialState}`);
            }
        }
    }
    checkPathToTerminal(def, errors) {
        if (!def.initialState)
            return;
        const visited = new Set();
        if (!this.canReachTerminal(def, def.initialState, visited)) {
            errors.push(`No path from ${def.initialState} to any terminal state`);
        }
    }
    canReachTerminal(def, state, visited) {
        if (def.stateConfig[state].terminal)
            return true;
        if (visited.has(state))
            return false;
        visited.add(state);
        for (const t of def.transitionsFrom(state)) {
            if (t.type === 'sub_flow' && t.exitMappings) {
                for (const target of t.exitMappings.values()) {
                    if (this.canReachTerminal(def, target, visited))
                        return true;
                }
                continue;
            }
            if (this.canReachTerminal(def, t.to, visited))
                return true;
        }
        const errTarget = def.errorTransitions.get(state);
        return errTarget !== undefined && this.canReachTerminal(def, errTarget, visited);
    }
    checkDag(def, errors) {
        const autoGraph = new Map();
        for (const t of def.transitions) {
            if (t.type === 'auto' || t.type === 'branch') {
                if (!autoGraph.has(t.from))
                    autoGraph.set(t.from, new Set());
                autoGraph.get(t.from).add(t.to);
            }
        }
        const visited = new Set();
        const inStack = new Set();
        for (const s of def.allStates()) {
            if (!visited.has(s) && this.hasCycle(autoGraph, s, visited, inStack)) {
                errors.push(`Auto/Branch transitions contain a cycle involving ${s}`);
                break;
            }
        }
    }
    hasCycle(graph, node, visited, inStack) {
        visited.add(node);
        inStack.add(node);
        for (const neighbor of graph.get(node) ?? []) {
            if (inStack.has(neighbor))
                return true;
            if (!visited.has(neighbor) && this.hasCycle(graph, neighbor, visited, inStack))
                return true;
        }
        inStack.delete(node);
        return false;
    }
    checkExternalUniqueness(def, errors) {
        const counts = new Map();
        for (const t of def.transitions) {
            if (t.type === 'external')
                counts.set(t.from, (counts.get(t.from) ?? 0) + 1);
        }
        for (const [state, count] of counts) {
            if (count > 1)
                errors.push(`State ${state} has ${count} external transitions (max 1)`);
        }
    }
    checkBranchCompleteness(def, errors) {
        const allStates = new Set(def.allStates());
        for (const t of def.transitions) {
            if (t.type === 'branch' && t.branchTargets.size > 0) {
                for (const [label, target] of t.branchTargets) {
                    if (!allStates.has(target)) {
                        errors.push(`Branch target '${label}' -> ${target} is not a valid state`);
                    }
                }
            }
        }
    }
    checkRequiresProduces(def, errors) {
        if (!def.initialState)
            return;
        const stateAvailable = new Map();
        this.checkRequiresProducesFrom(def, def.initialState, new Set(this.initiallyAvailableKeys), stateAvailable, errors);
    }
    checkRequiresProducesFrom(def, state, available, stateAvailable, errors) {
        if (stateAvailable.has(state)) {
            const existing = stateAvailable.get(state);
            let isSubset = true;
            for (const a of available) {
                if (!existing.has(a)) {
                    isSubset = false;
                    break;
                }
            }
            if (isSubset)
                return;
            // intersection
            for (const a of [...existing]) {
                if (!available.has(a))
                    existing.delete(a);
            }
        }
        else {
            stateAvailable.set(state, new Set(available));
        }
        for (const t of def.transitionsFrom(state)) {
            const newAvailable = new Set(stateAvailable.get(state));
            if (t.guard) {
                for (const req of t.guard.requires) {
                    if (!newAvailable.has(req))
                        errors.push(`Guard '${t.guard.name}' at ${t.from} requires ${req} but it may not be available`);
                }
                for (const p of t.guard.produces)
                    newAvailable.add(p);
            }
            if (t.branch) {
                for (const req of t.branch.requires) {
                    if (!newAvailable.has(req))
                        errors.push(`Branch '${t.branch.name}' at ${t.from} requires ${req} but it may not be available`);
                }
            }
            if (t.processor) {
                for (const req of t.processor.requires) {
                    if (!newAvailable.has(req))
                        errors.push(`Processor '${t.processor.name}' at ${t.from} -> ${t.to} requires ${req} but it may not be available`);
                }
                for (const p of t.processor.produces)
                    newAvailable.add(p);
            }
            this.checkRequiresProducesFrom(def, t.to, newAvailable, stateAvailable, errors);
            // Error path analysis: if processor fails, its produces are NOT available
            if (t.processor) {
                const errorTarget = def.errorTransitions.get(t.from);
                if (errorTarget) {
                    const errorAvailable = new Set(stateAvailable.get(state));
                    if (t.guard) {
                        for (const p of t.guard.produces)
                            errorAvailable.add(p);
                    }
                    this.checkRequiresProducesFrom(def, errorTarget, errorAvailable, stateAvailable, errors);
                }
            }
        }
    }
    checkAutoExternalConflict(def, errors) {
        for (const state of def.allStates()) {
            const trans = def.transitionsFrom(state);
            const hasAuto = trans.some(t => t.type === 'auto' || t.type === 'branch');
            const hasExternal = trans.some(t => t.type === 'external');
            if (hasAuto && hasExternal) {
                errors.push(`State ${state} has both auto/branch and external transitions — auto takes priority, making external unreachable`);
            }
        }
    }
    checkTerminalNoOutgoing(def, errors) {
        for (const t of def.transitions) {
            if (def.stateConfig[t.from].terminal && t.type !== 'sub_flow') {
                errors.push(`Terminal state ${t.from} has an outgoing transition to ${t.to}`);
            }
        }
    }
    checkSubFlowNestingDepth(def, errors, depth) {
        if (depth > 3) {
            errors.push(`SubFlow nesting depth exceeds maximum of 3 (flow: ${def.name})`);
            return;
        }
        for (const t of def.transitions) {
            if (t.type === 'sub_flow' && t.subFlowDefinition) {
                this.checkSubFlowNestingDepth(t.subFlowDefinition, errors, depth + 1);
            }
        }
    }
    checkSubFlowCircularRef(def, errors, visited) {
        if (visited.has(def.name)) {
            errors.push(`Circular sub-flow reference detected: ${[...visited].join(' -> ')} -> ${def.name}`);
            return;
        }
        visited.add(def.name);
        for (const t of def.transitions) {
            if (t.type === 'sub_flow' && t.subFlowDefinition) {
                this.checkSubFlowCircularRef(t.subFlowDefinition, errors, new Set(visited));
            }
        }
    }
    checkSubFlowExitCompleteness(def, errors) {
        for (const t of def.transitions) {
            if (t.type !== 'sub_flow' || !t.subFlowDefinition)
                continue;
            const subDef = t.subFlowDefinition;
            for (const terminal of subDef.terminalStates) {
                if (!t.exitMappings?.has(terminal)) {
                    errors.push(`SubFlow '${subDef.name}' at ${t.from} has terminal state ${terminal} with no onExit mapping`);
                }
            }
        }
    }
}
export class FromBuilder {
    builder;
    fromState;
    constructor(builder, fromState) {
        this.builder = builder;
        this.fromState = fromState;
    }
    auto(to, processor) {
        this.builder.addTransition({
            from: this.fromState, to, type: 'auto', processor,
            guard: undefined, branch: undefined, branchTargets: new Map(),
        });
        return this.builder;
    }
    external(to, guard, processor) {
        this.builder.addTransition({
            from: this.fromState, to, type: 'external', processor,
            guard, branch: undefined, branchTargets: new Map(),
        });
        return this.builder;
    }
    branch(branch) {
        return new BranchBuilder(this.builder, this.fromState, branch);
    }
    subFlow(subFlowDef) {
        return new SubFlowBuilder(this.builder, this.fromState, subFlowDef);
    }
}
export class SubFlowBuilder {
    builder;
    fromState;
    subFlowDef;
    exitMap = new Map();
    constructor(builder, fromState, subFlowDef) {
        this.builder = builder;
        this.fromState = fromState;
        this.subFlowDef = subFlowDef;
    }
    onExit(terminalName, parentState) {
        this.exitMap.set(terminalName, parentState);
        return this;
    }
    endSubFlow() {
        this.builder.addTransition({
            from: this.fromState, to: this.fromState, type: 'sub_flow',
            processor: undefined, guard: undefined, branch: undefined,
            branchTargets: new Map(),
            subFlowDefinition: this.subFlowDef,
            exitMappings: new Map(this.exitMap),
        });
        return this.builder;
    }
}
export class BranchBuilder {
    builder;
    fromState;
    branch;
    targets = new Map();
    processors = new Map();
    constructor(builder, fromState, branch) {
        this.builder = builder;
        this.fromState = fromState;
        this.branch = branch;
    }
    to(state, label, processor) {
        this.targets.set(label, state);
        if (processor)
            this.processors.set(label, processor);
        return this;
    }
    endBranch() {
        for (const [label, target] of this.targets) {
            this.builder.addTransition({
                from: this.fromState, to: target, type: 'branch',
                processor: this.processors.get(label),
                guard: undefined, branch: this.branch,
                branchTargets: new Map(this.targets),
            });
        }
        return this.builder;
    }
}
