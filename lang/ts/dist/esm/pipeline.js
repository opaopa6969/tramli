import { FlowContext } from './flow-context.js';
import { FlowError } from './flow-error.js';
export class PipelineException extends FlowError {
    failedStep;
    completedSteps;
    context;
    cause;
    constructor(failedStep, completedSteps, context, cause) {
        super('PIPELINE_STEP_FAILED', `Pipeline step '${failedStep}' failed: ${cause.message}`);
        this.failedStep = failedStep;
        this.completedSteps = completedSteps;
        this.context = context;
        this.cause = cause;
    }
}
export class PipelineDataFlow {
    steps;
    initiallyAvailable;
    constructor(steps, initiallyAvailable) {
        this.steps = steps;
        this.initiallyAvailable = initiallyAvailable;
    }
    deadData() {
        const allProduced = new Set(this.initiallyAvailable);
        const allConsumed = new Set();
        for (const s of this.steps) {
            for (const r of s.requires)
                allConsumed.add(r);
            for (const p of s.produces)
                allProduced.add(p);
        }
        const dead = new Set();
        for (const p of allProduced) {
            if (!allConsumed.has(p))
                dead.add(p);
        }
        return dead;
    }
    stepOrder() { return this.steps.map(s => s.name); }
    availableAfter(stepName) {
        const available = new Set(this.initiallyAvailable);
        for (const s of this.steps) {
            for (const p of s.produces)
                available.add(p);
            if (s.name === stepName)
                return available;
        }
        return available;
    }
    toMermaid() {
        const lines = ['flowchart LR'];
        for (const s of this.steps) {
            for (const r of s.requires)
                lines.push(`    ${r} -->|requires| ${s.name}`);
            for (const p of s.produces)
                lines.push(`    ${s.name} -->|produces| ${p}`);
        }
        return lines.join('\n') + '\n';
    }
}
export class Pipeline {
    name;
    steps;
    _initiallyAvailable;
    _dataFlow;
    strictMode = false;
    transitionLogger;
    stateLogger;
    errorLogger;
    constructor(name, steps, initiallyAvailable) {
        this.name = name;
        this.steps = [...steps];
        this._initiallyAvailable = new Set(initiallyAvailable);
        this._dataFlow = new PipelineDataFlow(steps, initiallyAvailable);
    }
    dataFlow() { return this._dataFlow; }
    setStrictMode(strict) { this.strictMode = strict; }
    setTransitionLogger(l) { this.transitionLogger = l ?? undefined; }
    setStateLogger(l) { this.stateLogger = l ?? undefined; }
    setErrorLogger(l) { this.errorLogger = l ?? undefined; }
    removeAllLoggers() { this.transitionLogger = undefined; this.stateLogger = undefined; this.errorLogger = undefined; }
    async execute(initialData) {
        const flowId = crypto.randomUUID();
        const ctx = new FlowContext(flowId);
        for (const [k, v] of initialData)
            ctx.put(k, v);
        const completed = [];
        let prev = 'initial';
        for (const step of this.steps) {
            const stepStart = performance.now();
            this.transitionLogger?.({ flowId, flowName: this.name, from: prev, to: step.name, trigger: step.name, durationMicros: 0 });
            const keysBefore = this.stateLogger ? new Set(ctx.snapshot().keys()) : null;
            try {
                await step.process(ctx);
            }
            catch (e) {
                const err = e instanceof Error ? e : new Error(String(e));
                const durationMicros = Math.round((performance.now() - stepStart) * 1000);
                this.errorLogger?.({ flowId, flowName: this.name, from: prev, to: step.name, trigger: step.name, cause: err, durationMicros });
                throw new PipelineException(step.name, [...completed], ctx, err);
            }
            if (this.strictMode) {
                for (const prod of step.produces) {
                    if (!ctx.has(prod)) {
                        const err = new FlowError('PRODUCES_VIOLATION', `Step '${step.name}' declares produces ${prod} but did not put it`);
                        throw new PipelineException(step.name, [...completed], ctx, err);
                    }
                }
            }
            if (this.stateLogger && keysBefore) {
                for (const [k] of ctx.snapshot()) {
                    if (!keysBefore.has(k)) {
                        this.stateLogger({ flowId, flowName: this.name, state: step.name, key: k, value: ctx.snapshot().get(k) });
                    }
                }
            }
            completed.push(step.name);
            prev = step.name;
        }
        return ctx;
    }
    asStep() {
        const self = this;
        return {
            name: self.name,
            requires: [...self._initiallyAvailable],
            produces: self.steps.flatMap(s => s.produces),
            async process(ctx) {
                for (const s of self.steps)
                    await s.process(ctx);
            },
        };
    }
    static builder(name) { return new PipelineBuilder(name); }
}
export class PipelineBuilder {
    name;
    steps = [];
    _initiallyAvailable = new Set();
    constructor(name) {
        this.name = name;
    }
    initiallyAvailable(...keys) {
        for (const k of keys)
            this._initiallyAvailable.add(k);
        return this;
    }
    step(s) { this.steps.push(s); return this; }
    build() {
        const errors = [];
        const available = new Set(this._initiallyAvailable);
        for (const s of this.steps) {
            for (const req of s.requires) {
                if (!available.has(req))
                    errors.push(`Step '${s.name}' requires ${req} but it may not be available`);
            }
            for (const p of s.produces)
                available.add(p);
        }
        if (errors.length > 0) {
            throw new FlowError('INVALID_PIPELINE', `Pipeline '${this.name}' has ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
        }
        return Pipeline.builder(this.name);
        // Use private constructor via reflection-like pattern
    }
}
// Fix: expose Pipeline constructor to builder
Object.defineProperty(PipelineBuilder.prototype, 'build', {
    value: function () {
        const errors = [];
        const available = new Set(this._initiallyAvailable);
        for (const s of this.steps) {
            for (const req of s.requires) {
                if (!available.has(req))
                    errors.push(`Step '${s.name}' requires ${req} but it may not be available`);
            }
            for (const p of s.produces)
                available.add(p);
        }
        if (errors.length > 0) {
            throw new FlowError('INVALID_PIPELINE', `Pipeline '${this.name}' has ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
        }
        const pipeline = Object.create(Pipeline.prototype);
        Object.assign(pipeline, {
            name: this.name,
            steps: [...this.steps],
            _initiallyAvailable: new Set(this._initiallyAvailable),
            _dataFlow: new PipelineDataFlow([...this.steps], new Set(this._initiallyAvailable)),
            strictMode: false,
        });
        return pipeline;
    },
});
