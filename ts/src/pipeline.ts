import { FlowContext } from './flow-context.js';
import { FlowError } from './flow-error.js';
import type { FlowKey } from './flow-key.js';
import type { TransitionLogEntry, StateLogEntry, ErrorLogEntry } from './flow-engine.js';

export interface PipelineStep {
  name: string;
  requires: FlowKey<unknown>[];
  produces: FlowKey<unknown>[];
  process(ctx: FlowContext): Promise<void> | void;
}

export class PipelineException extends FlowError {
  constructor(
    public readonly failedStep: string,
    public readonly completedSteps: string[],
    public readonly context: FlowContext,
    public readonly cause: Error,
  ) {
    super('PIPELINE_STEP_FAILED', `Pipeline step '${failedStep}' failed: ${cause.message}`);
  }
}

export class PipelineDataFlow {
  constructor(
    private readonly steps: PipelineStep[],
    private readonly initiallyAvailable: Set<string>,
  ) {}

  deadData(): Set<string> {
    const allProduced = new Set(this.initiallyAvailable);
    const allConsumed = new Set<string>();
    for (const s of this.steps) {
      for (const r of s.requires) allConsumed.add(r as string);
      for (const p of s.produces) allProduced.add(p as string);
    }
    const dead = new Set<string>();
    for (const p of allProduced) { if (!allConsumed.has(p)) dead.add(p); }
    return dead;
  }

  stepOrder(): string[] { return this.steps.map(s => s.name); }

  availableAfter(stepName: string): Set<string> {
    const available = new Set(this.initiallyAvailable);
    for (const s of this.steps) {
      for (const p of s.produces) available.add(p as string);
      if (s.name === stepName) return available;
    }
    return available;
  }

  toMermaid(): string {
    const lines = ['flowchart LR'];
    for (const s of this.steps) {
      for (const r of s.requires) lines.push(`    ${r} -->|requires| ${s.name}`);
      for (const p of s.produces) lines.push(`    ${s.name} -->|produces| ${p}`);
    }
    return lines.join('\n') + '\n';
  }
}

export class Pipeline {
  readonly name: string;
  private readonly steps: PipelineStep[];
  private readonly _initiallyAvailable: Set<string>;
  private readonly _dataFlow: PipelineDataFlow;
  private strictMode = false;
  private transitionLogger?: (entry: TransitionLogEntry) => void;
  private stateLogger?: (entry: StateLogEntry) => void;
  private errorLogger?: (entry: ErrorLogEntry) => void;

  private constructor(name: string, steps: PipelineStep[], initiallyAvailable: Set<string>) {
    this.name = name;
    this.steps = [...steps];
    this._initiallyAvailable = new Set(initiallyAvailable);
    this._dataFlow = new PipelineDataFlow(steps, initiallyAvailable);
  }

  dataFlow(): PipelineDataFlow { return this._dataFlow; }

  setStrictMode(strict: boolean): void { this.strictMode = strict; }
  setTransitionLogger(l: ((e: TransitionLogEntry) => void) | null): void { this.transitionLogger = l ?? undefined; }
  setStateLogger(l: ((e: StateLogEntry) => void) | null): void { this.stateLogger = l ?? undefined; }
  setErrorLogger(l: ((e: ErrorLogEntry) => void) | null): void { this.errorLogger = l ?? undefined; }
  removeAllLoggers(): void { this.transitionLogger = undefined; this.stateLogger = undefined; this.errorLogger = undefined; }

  async execute(initialData: Map<string, unknown>): Promise<FlowContext> {
    const flowId = crypto.randomUUID();
    const ctx = new FlowContext(flowId);
    for (const [k, v] of initialData) ctx.put(k as any, v);

    const completed: string[] = [];
    let prev = 'initial';

    for (const step of this.steps) {
      const stepStart = performance.now();
      this.transitionLogger?.({ flowId, flowName: this.name, from: prev, to: step.name, trigger: step.name, durationMicros: 0 });

      const keysBefore = this.stateLogger ? new Set(ctx.snapshot().keys()) : null;

      try {
        await step.process(ctx);
      } catch (e: any) {
        const err = e instanceof Error ? e : new Error(String(e));
        const durationMicros = Math.round((performance.now() - stepStart) * 1000);
        this.errorLogger?.({ flowId, flowName: this.name, from: prev, to: step.name, trigger: step.name, cause: err, durationMicros });
        throw new PipelineException(step.name, [...completed], ctx, err);
      }

      if (this.strictMode) {
        for (const prod of step.produces) {
          if (!ctx.has(prod)) {
            const err = new FlowError('PRODUCES_VIOLATION',
              `Step '${step.name}' declares produces ${prod} but did not put it`);
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

  asStep(): PipelineStep {
    const self = this;
    return {
      name: self.name,
      requires: [...self._initiallyAvailable] as FlowKey<unknown>[],
      produces: self.steps.flatMap(s => s.produces),
      async process(ctx: FlowContext) {
        for (const s of self.steps) await s.process(ctx);
      },
    };
  }

  static builder(name: string): PipelineBuilder { return new PipelineBuilder(name); }
}

export class PipelineBuilder {
  private readonly steps: PipelineStep[] = [];
  private readonly _initiallyAvailable = new Set<string>();

  constructor(private readonly name: string) {}

  initiallyAvailable(...keys: FlowKey<unknown>[]): this {
    for (const k of keys) this._initiallyAvailable.add(k as string);
    return this;
  }

  step(s: PipelineStep): this { this.steps.push(s); return this; }

  build(): Pipeline {
    const errors: string[] = [];
    const available = new Set(this._initiallyAvailable);
    for (const s of this.steps) {
      for (const req of s.requires) {
        if (!available.has(req as string))
          errors.push(`Step '${s.name}' requires ${req} but it may not be available`);
      }
      for (const p of s.produces) available.add(p as string);
    }
    if (errors.length > 0) {
      throw new FlowError('INVALID_PIPELINE',
        `Pipeline '${this.name}' has ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
    }
    return (Pipeline as any).builder(this.name) as unknown as Pipeline;
    // Use private constructor via reflection-like pattern
  }
}

// Fix: expose Pipeline constructor to builder
Object.defineProperty(PipelineBuilder.prototype, 'build', {
  value: function(this: PipelineBuilder) {
    const errors: string[] = [];
    const available = new Set((this as any)._initiallyAvailable);
    for (const s of (this as any).steps) {
      for (const req of s.requires) {
        if (!available.has(req as string))
          errors.push(`Step '${s.name}' requires ${req} but it may not be available`);
      }
      for (const p of s.produces) available.add(p as string);
    }
    if (errors.length > 0) {
      throw new FlowError('INVALID_PIPELINE',
        `Pipeline '${(this as any).name}' has ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
    }
    const pipeline = Object.create(Pipeline.prototype);
    Object.assign(pipeline, {
      name: (this as any).name,
      steps: [...(this as any).steps],
      _initiallyAvailable: new Set((this as any)._initiallyAvailable),
      _dataFlow: new PipelineDataFlow([...(this as any).steps], new Set((this as any)._initiallyAvailable)),
      strictMode: false,
    });
    return pipeline as Pipeline;
  },
});
