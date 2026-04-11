"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowEngine = exports.DEFAULT_MAX_CHAIN_DEPTH = void 0;
const flow_context_js_1 = require("./flow-context");
const flow_instance_js_1 = require("./flow-instance");
const flow_error_js_1 = require("./flow-error");
/** Default max auto-chain depth. Override via constructor options. */
exports.DEFAULT_MAX_CHAIN_DEPTH = 10;
class FlowEngine {
    store;
    strictMode;
    maxChainDepth;
    transitionLogger;
    stateLogger;
    errorLogger;
    guardLogger;
    constructor(store, options) {
        this.store = store;
        this.strictMode = options?.strictMode ?? false;
        this.maxChainDepth = options?.maxChainDepth ?? exports.DEFAULT_MAX_CHAIN_DEPTH;
    }
    setTransitionLogger(logger) {
        this.transitionLogger = logger ?? undefined;
    }
    setStateLogger(logger) {
        this.stateLogger = logger ?? undefined;
    }
    setErrorLogger(logger) {
        this.errorLogger = logger ?? undefined;
    }
    setGuardLogger(logger) {
        this.guardLogger = logger ?? undefined;
    }
    getTransitionLogger() { return this.transitionLogger; }
    getStateLogger() { return this.stateLogger; }
    getErrorLogger() { return this.errorLogger; }
    getGuardLogger() { return this.guardLogger; }
    removeAllLoggers() {
        this.transitionLogger = undefined;
        this.stateLogger = undefined;
        this.errorLogger = undefined;
        this.guardLogger = undefined;
    }
    async startFlow(definition, sessionId, initialData) {
        const flowId = crypto.randomUUID();
        const ctx = new flow_context_js_1.FlowContext(flowId);
        for (const [key, value] of initialData)
            ctx.put(key, value);
        const initial = definition.initialState;
        if (!initial)
            throw new flow_error_js_1.FlowError('INVALID_FLOW_DEFINITION', 'No initial state');
        const expiresAt = new Date(Date.now() + definition.ttl);
        const flow = new flow_instance_js_1.FlowInstance(flowId, sessionId, definition, ctx, initial, expiresAt);
        this.store.create(flow);
        await this.executeAutoChain(flow);
        this.store.save(flow);
        return flow;
    }
    async resumeAndExecute(flowId, definition, externalData) {
        const flow = this.store.loadForUpdate(flowId, definition);
        if (!flow)
            throw new flow_error_js_1.FlowError('FLOW_NOT_FOUND', `Flow ${flowId} not found or already completed`);
        if (externalData) {
            for (const [key, value] of externalData)
                flow.context.put(key, value);
        }
        if (new Date() > flow.expiresAt) {
            flow.complete('EXPIRED');
            this.store.save(flow);
            return flow;
        }
        // If actively in a sub-flow, delegate resume
        if (flow.activeSubFlow) {
            return this.resumeSubFlow(flow, definition);
        }
        const currentState = flow.currentState;
        // Multi-external: select guard by requires matching
        const externals = definition.externalsFrom(currentState);
        if (externals.length === 0)
            throw flow_error_js_1.FlowError.invalidTransition(currentState, currentState);
        let transition;
        const dataKeys = externalData ? new Set(externalData.keys()) : new Set();
        for (const ext of externals) {
            if (ext.guard && ext.guard.requires.every(r => dataKeys.has(r))) {
                transition = ext;
                break;
            }
        }
        if (!transition) {
            // Fallback: first external
            transition = externals[0];
        }
        // Per-state timeout check
        if (transition.timeout != null) {
            const deadline = new Date(flow.stateEnteredAt.getTime() + transition.timeout);
            if (new Date() > deadline) {
                flow.complete('EXPIRED');
                this.store.save(flow);
                return flow;
            }
        }
        const guard = transition.guard;
        if (guard) {
            const guardStart = performance.now();
            const output = await guard.validate(flow.context);
            const guardDurationMicros = Math.round((performance.now() - guardStart) * 1000);
            switch (output.type) {
                case 'accepted': {
                    this.logGuard(flow, currentState, guard.name, 'accepted', guardDurationMicros);
                    const transStart = performance.now();
                    const backup = flow.context.snapshot();
                    if (output.data) {
                        for (const [key, value] of output.data)
                            flow.context.put(key, value);
                    }
                    try {
                        if (transition.processor)
                            await transition.processor.process(flow.context);
                        const from = flow.currentState;
                        this.fireExit(flow, from);
                        flow.transitionTo(transition.to);
                        this.fireEnter(flow, transition.to);
                        this.store.recordTransition(flow.id, from, transition.to, guard.name, flow.context);
                        this.logTransition(flow, from, transition.to, guard.name, transStart);
                    }
                    catch (e) {
                        flow.context.restoreFrom(backup);
                        this.handleError(flow, currentState, e instanceof Error ? e : new Error(String(e)));
                        this.store.save(flow);
                        return flow;
                    }
                    break;
                }
                case 'rejected': {
                    this.logGuard(flow, currentState, guard.name, 'rejected', guardDurationMicros, output.reason);
                    flow.incrementGuardFailure(guard.name);
                    if (flow.guardFailureCount >= definition.maxGuardRetries) {
                        this.handleError(flow, currentState);
                    }
                    this.store.save(flow);
                    return flow;
                }
                case 'expired': {
                    this.logGuard(flow, currentState, guard.name, 'expired', guardDurationMicros);
                    flow.complete('EXPIRED');
                    this.store.save(flow);
                    return flow;
                }
            }
        }
        else {
            const transStart = performance.now();
            const from = flow.currentState;
            this.fireExit(flow, from);
            flow.transitionTo(transition.to);
            this.fireEnter(flow, transition.to);
            this.store.recordTransition(flow.id, from, transition.to, 'external', flow.context);
            this.logTransition(flow, from, transition.to, 'external', transStart);
        }
        await this.executeAutoChain(flow);
        this.store.save(flow);
        return flow;
    }
    async executeAutoChain(flow) {
        let depth = 0;
        while (depth < this.maxChainDepth) {
            const current = flow.currentState;
            if (flow.definition.stateConfig[current].terminal) {
                flow.complete(current);
                break;
            }
            const transitions = flow.definition.transitionsFrom(current);
            // Check for sub-flow transition
            const subFlowT = transitions.find(t => t.type === 'sub_flow');
            if (subFlowT) {
                const advanced = await this.executeSubFlow(flow, subFlowT);
                depth += advanced;
                if (advanced === 0)
                    break; // sub-flow stopped at external
                continue;
            }
            const autoOrBranch = transitions.find(t => t.type === 'auto' || t.type === 'branch');
            if (!autoOrBranch)
                break;
            const backup = flow.context.snapshot();
            const stepStart = performance.now();
            try {
                if (autoOrBranch.type === 'auto') {
                    if (autoOrBranch.processor) {
                        await autoOrBranch.processor.process(flow.context);
                        this.verifyProduces(autoOrBranch.processor, flow.context, flow.definition.strictMode);
                    }
                    const from = flow.currentState;
                    this.fireExit(flow, from);
                    flow.transitionTo(autoOrBranch.to);
                    this.fireEnter(flow, autoOrBranch.to);
                    const trigger = autoOrBranch.processor?.name ?? 'auto';
                    this.store.recordTransition(flow.id, from, autoOrBranch.to, trigger, flow.context);
                    this.logTransition(flow, from, autoOrBranch.to, trigger, stepStart);
                }
                else {
                    const branch = autoOrBranch.branch;
                    const label = await branch.decide(flow.context);
                    const target = autoOrBranch.branchTargets.get(label);
                    if (!target) {
                        throw new flow_error_js_1.FlowError('UNKNOWN_BRANCH', `Branch '${branch.name}' returned unknown label: ${label}`);
                    }
                    const specific = transitions.find(t => t.type === 'branch' && t.branchLabel === label) ?? transitions.find(t => t.type === 'branch' && t.to === target) ?? autoOrBranch;
                    if (specific.processor)
                        await specific.processor.process(flow.context);
                    const from = flow.currentState;
                    this.fireExit(flow, from);
                    flow.transitionTo(target);
                    this.fireEnter(flow, target);
                    const trigger = `${branch.name}:${label}`;
                    this.store.recordTransition(flow.id, from, target, trigger, flow.context);
                    this.logTransition(flow, from, target, trigger, stepStart);
                }
            }
            catch (e) {
                flow.context.restoreFrom(backup);
                this.handleError(flow, flow.currentState, e instanceof Error ? e : new Error(String(e)));
                return;
            }
            depth++;
        }
        if (depth >= this.maxChainDepth)
            throw flow_error_js_1.FlowError.maxChainDepth();
    }
    async executeSubFlow(parentFlow, subFlowTransition) {
        const subDef = subFlowTransition.subFlowDefinition;
        const exitMappings = subFlowTransition.exitMappings;
        const subInitial = subDef.initialState;
        const subFlow = new flow_instance_js_1.FlowInstance(parentFlow.id, parentFlow.sessionId, subDef, parentFlow.context, subInitial, parentFlow.expiresAt);
        parentFlow.setActiveSubFlow(subFlow);
        await this.executeAutoChain(subFlow);
        if (subFlow.isCompleted) {
            parentFlow.setActiveSubFlow(null);
            const target = exitMappings.get(subFlow.exitState);
            if (target) {
                const sfStart = performance.now();
                const from = parentFlow.currentState;
                this.fireExit(parentFlow, from);
                parentFlow.transitionTo(target);
                this.fireEnter(parentFlow, target);
                const trigger = `subFlow:${subDef.name}/${subFlow.exitState}`;
                this.store.recordTransition(parentFlow.id, from, target, trigger, parentFlow.context);
                this.logTransition(parentFlow, from, target, trigger, sfStart);
                return 1;
            }
            // Error bubbling: no exit mapping → fall back to parent's error transitions
            this.handleError(parentFlow, parentFlow.currentState);
            return 1;
        }
        return 0; // sub-flow stopped at external
    }
    async resumeSubFlow(parentFlow, parentDef) {
        const subFlow = parentFlow.activeSubFlow;
        const subDef = subFlow.definition;
        const transition = subDef.externalFrom(subFlow.currentState);
        if (!transition) {
            throw new flow_error_js_1.FlowError('INVALID_TRANSITION', `No external transition from sub-flow state ${subFlow.currentState}`);
        }
        const guard = transition.guard;
        if (guard) {
            const guardStart = performance.now();
            const output = await guard.validate(parentFlow.context);
            const guardDur = Math.round((performance.now() - guardStart) * 1000);
            if (output.type === 'accepted') {
                if (output.data) {
                    for (const [key, value] of output.data)
                        parentFlow.context.put(key, value);
                }
                const sfStart = performance.now();
                const sfFrom = subFlow.currentState;
                subFlow.transitionTo(transition.to);
                this.store.recordTransition(parentFlow.id, sfFrom, transition.to, guard.name, parentFlow.context);
                this.logTransition(parentFlow, sfFrom, transition.to, guard.name, sfStart);
                this.logGuard(parentFlow, sfFrom, guard.name, 'accepted', guardDur);
            }
            else if (output.type === 'rejected') {
                subFlow.incrementGuardFailure();
                if (subFlow.guardFailureCount >= subDef.maxGuardRetries) {
                    subFlow.complete('ERROR');
                }
                this.store.save(parentFlow);
                return parentFlow;
            }
            else {
                parentFlow.complete('EXPIRED');
                this.store.save(parentFlow);
                return parentFlow;
            }
        }
        else {
            subFlow.transitionTo(transition.to);
        }
        await this.executeAutoChain(subFlow);
        if (subFlow.isCompleted) {
            parentFlow.setActiveSubFlow(null);
            const subFlowT = parentDef.transitionsFrom(parentFlow.currentState)
                .find(t => t.type === 'sub_flow');
            if (subFlowT?.exitMappings) {
                const target = subFlowT.exitMappings.get(subFlow.exitState);
                if (target) {
                    const exitStart = performance.now();
                    const from = parentFlow.currentState;
                    this.fireExit(parentFlow, from);
                    parentFlow.transitionTo(target);
                    this.fireEnter(parentFlow, target);
                    const trigger = `subFlow:${subDef.name}/${subFlow.exitState}`;
                    this.store.recordTransition(parentFlow.id, from, target, trigger, parentFlow.context);
                    this.logTransition(parentFlow, from, target, trigger, exitStart);
                    await this.executeAutoChain(parentFlow);
                }
            }
        }
        this.store.save(parentFlow);
        return parentFlow;
    }
    verifyProduces(processor, ctx, defStrictMode) {
        if (!this.strictMode && !defStrictMode)
            return;
        for (const prod of processor.produces) {
            if (!ctx.has(prod)) {
                throw new flow_error_js_1.FlowError('PRODUCES_VIOLATION', `Processor '${processor.name}' declares produces ${prod} but did not put it in context (strictMode)`);
            }
        }
    }
    fireEnter(flow, state) {
        const action = flow.definition.enterAction(state);
        if (action)
            action(flow.context);
    }
    fireExit(flow, state) {
        const action = flow.definition.exitAction(state);
        if (action)
            action(flow.context);
    }
    logTransition(flow, from, to, trigger, startMs) {
        if (this.transitionLogger) {
            const durationMicros = Math.round((performance.now() - startMs) * 1000);
            this.transitionLogger({ flowId: flow.id, flowName: flow.definition.name, from, to, trigger, durationMicros });
        }
    }
    logError(flow, from, to, trigger, cause, startMs) {
        if (this.errorLogger) {
            const durationMicros = Math.round((performance.now() - startMs) * 1000);
            this.errorLogger({ flowId: flow.id, flowName: flow.definition.name, from, to, trigger, cause, durationMicros });
        }
    }
    logGuard(flow, state, guardName, result, durationMicros, reason) {
        this.guardLogger?.({ flowId: flow.id, flowName: flow.definition.name, state, guardName, result, reason, durationMicros });
    }
    handleError(flow, fromState, cause) {
        const errorStart = performance.now();
        if (cause) {
            flow.setLastError(`${cause.constructor.name}: ${cause.message}`);
            if (cause instanceof flow_error_js_1.FlowError) {
                const available = new Set();
                for (const [k] of flow.context.snapshot())
                    available.add(k);
                cause.withContextSnapshot(available, new Set());
            }
        }
        this.logError(flow, fromState, null, 'error', cause ?? null, errorStart);
        // 1. Try exception-typed routes first (onStepError)
        if (cause && flow.definition.exceptionRoutes) {
            const routes = flow.definition.exceptionRoutes.get(fromState);
            if (routes) {
                for (const route of routes) {
                    if (cause instanceof route.errorClass) {
                        const from = flow.currentState;
                        flow.transitionTo(route.target);
                        const trigger = `error:${cause.constructor.name}`;
                        this.store.recordTransition(flow.id, from, route.target, trigger, flow.context);
                        this.logTransition(flow, from, route.target, trigger, errorStart);
                        if (flow.definition.stateConfig[route.target]?.terminal)
                            flow.complete(route.target);
                        return;
                    }
                }
            }
        }
        // 2. Fall back to state-based error transition (onError)
        const errorTarget = flow.definition.errorTransitions.get(fromState);
        if (errorTarget) {
            const from = flow.currentState;
            flow.transitionTo(errorTarget);
            this.store.recordTransition(flow.id, from, errorTarget, 'error', flow.context);
            this.logTransition(flow, from, errorTarget, 'error', errorStart);
            if (flow.definition.stateConfig[errorTarget]?.terminal)
                flow.complete(errorTarget);
        }
        else {
            flow.complete('TERMINAL_ERROR');
        }
    }
}
exports.FlowEngine = FlowEngine;
