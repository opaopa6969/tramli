import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateProcessor, TransitionGuard, StateConfig, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

type S = 'INIT' | 'STEP_A' | 'STEP_B' | 'DONE' | 'UNUSED';

const stateConfig: Record<S, StateConfig> = {
  INIT:   { terminal: false, initial: true },
  STEP_A: { terminal: false },
  STEP_B: { terminal: false },
  DONE:   { terminal: true },
  UNUSED: { terminal: false },
};

const Alpha = flowKey<string>('Alpha');
const Beta = flowKey<number>('Beta');
const Gamma = flowKey<boolean>('Gamma');

const producerA: StateProcessor<S> = {
  name: 'ProducerA',
  requires: [],
  produces: [Alpha],
  process(ctx: FlowContext) { ctx.put(Alpha, 'a'); },
};

const needsBeta: StateProcessor<S> = {
  name: 'NeedsBeta',
  requires: [Beta],
  produces: [],
  process(_ctx: FlowContext) {},
};

const guardNeedsGamma: TransitionGuard<S> = {
  name: 'GuardNeedsGamma',
  requires: [Gamma],
  produces: [],
  maxRetries: 1,
  validate(_ctx: FlowContext): GuardOutput { return { type: 'accepted' }; },
};

describe('ValidationError structured fields', () => {
  it('parseValidationError handles Processor with availableTypes', () => {
    const { errors } = Tramli.define<S>('diag-proc', stateConfig)
      .initiallyAvailable(Alpha)
      .from('INIT').auto('STEP_A', needsBeta)
      .from('STEP_A').auto('DONE', producerA)
      .buildAndValidate();

    const missing = errors.find(e => e.code === 'MISSING_REQUIRES' && e.component === 'processor');
    expect(missing).toBeDefined();
    expect(missing!.missingTypes).toEqual(['Beta']);
    expect(missing!.transition).toBe('INIT->STEP_A');
    expect(missing!.availableTypes).toBeDefined();
    expect(missing!.availableTypes).toContain('Alpha');
  });

  it('parseValidationError handles Guard errors', () => {
    const { errors } = Tramli.define<S>('diag-guard', stateConfig)
      .from('INIT').external('STEP_A', guardNeedsGamma)
      .from('STEP_A').auto('DONE', producerA)
      .buildAndValidate();

    const missing = errors.find(e => e.code === 'MISSING_REQUIRES' && e.component === 'guard');
    expect(missing).toBeDefined();
    expect(missing!.missingTypes).toEqual(['Gamma']);
    expect(missing!.state).toBe('INIT');
    expect(missing!.availableTypes).toBeDefined();
  });

  it('UNREACHABLE_STATE has state field', () => {
    const { errors } = Tramli.define<S>('diag-reach', stateConfig)
      .from('INIT').auto('DONE', producerA)
      .buildAndValidate();

    const unreach = errors.find(e => e.code === 'UNREACHABLE_STATE');
    expect(unreach).toBeDefined();
    expect(unreach!.state).toBeDefined();
  });
});

describe('allowUnreachable', () => {
  it('skips unreachable state errors for shared enum usage', () => {
    const { errors, definition } = Tramli.define<S>('diag-allow', stateConfig)
      .allowUnreachable()
      .from('INIT').auto('DONE', producerA)
      .buildAndValidate();

    const unreach = errors.filter(e => e.code === 'UNREACHABLE_STATE');
    expect(unreach).toHaveLength(0);
    expect(definition).not.toBeNull();
  });
});

describe('buildAndValidate diagnosticGraph', () => {
  it('returns diagnosticGraph even when validation fails', () => {
    const { errors, diagnosticGraph } = Tramli.define<S>('diag-graph', stateConfig)
      .initiallyAvailable(Alpha)
      .from('INIT').auto('STEP_A', needsBeta)
      .from('STEP_A').auto('DONE', producerA)
      .buildAndValidate();

    expect(errors.length).toBeGreaterThan(0);
    expect(diagnosticGraph).not.toBeNull();
    if (diagnosticGraph) {
      const explained = diagnosticGraph.explain('INIT' as S, Beta);
      expect(explained.missing.length).toBeGreaterThan(0);
      expect(explained.missing[0].type).toBe('Beta');

      const why = diagnosticGraph.whyMissing(Beta, 'INIT' as S);
      expect(why.length).toBeGreaterThan(0);
      expect(why.some(l => l.includes('Beta'))).toBe(true);
    }
  });

  it('returns diagnosticGraph on successful build too', () => {
    const { errors, diagnosticGraph, definition } = Tramli.define<S>('diag-ok', stateConfig)
      .allowUnreachable()
      .initiallyAvailable(Alpha)
      .from('INIT').auto('DONE', producerA)
      .buildAndValidate();

    expect(errors).toHaveLength(0);
    expect(definition).not.toBeNull();
    expect(diagnosticGraph).not.toBeNull();
  });
});
