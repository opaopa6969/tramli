/**
 * Shared test scenarios matching shared-tests/scenarios/*.yaml.
 * These tests must pass identically in Java, TypeScript, and Rust.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── Shared types ──────────────────────────────────
type TwoStep = 'INIT' | 'DONE' | 'ERROR';
const twoStepConfig: Record<TwoStep, StateConfig> = {
  INIT: { terminal: false, initial: true },
  DONE: { terminal: true },
  ERROR: { terminal: true },
};

const Input = flowKey<{ value: string }>('Input');
const Middle = flowKey<{ value: string }>('Middle');

function ok(name: string, reqs: any[], prods: any[]): StateProcessor<any> {
  return {
    name, requires: reqs, produces: prods,
    process(ctx: FlowContext) {
      for (const p of prods) ctx.put(p, { value: name });
    },
  };
}

describe('Shared Scenarios', () => {
  // ─── subflow-basic.yaml ─────────────────────────
  it('subflow basic', async () => {
    type SubStep = 'S_INIT' | 'S_PROCESS' | 'S_DONE';
    const subConfig: Record<SubStep, StateConfig> = {
      S_INIT: { terminal: false, initial: true },
      S_PROCESS: { terminal: false },
      S_DONE: { terminal: true },
    };
    const SubOutput = flowKey<{ value: string }>('SubOutput');

    const subDef = Tramli.define<SubStep>('sub', subConfig)
      .initiallyAvailable(Input)
      .from('S_INIT').auto('S_PROCESS', ok('SubP1', [Input], [SubOutput]))
      .from('S_PROCESS').auto('S_DONE', ok('SubP2', [SubOutput], []))
      .build();

    const mainDef = Tramli.define<TwoStep>('main', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').subFlow(subDef).onExit('S_DONE', 'DONE').endSubFlow()
      .onAnyError('ERROR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore());
    const flow = await engine.startFlow(mainDef, 's1', new Map([[Input as string, { value: 'x' }]]));
    expect(flow.currentState).toBe('DONE');
    expect(flow.isCompleted).toBe(true);
  });

  // ─── strictMode test ────────────────────────────
  it('strictMode detects produces violation', async () => {
    const badProducer: StateProcessor<TwoStep> = {
      name: 'BadProducer',
      requires: [],
      produces: [Input], // declares produces but does NOT put
      process(_ctx: FlowContext) { /* intentionally empty */ },
    };

    const def = Tramli.define<TwoStep>('strict-test', twoStepConfig)
      .from('INIT').auto('DONE', badProducer)
      .onAnyError('ERROR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore(), { strictMode: true });
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('ERROR');
  });
});
