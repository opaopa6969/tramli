import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { FlowError } from '../src/flow-error.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, BranchProcessor, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── State enums ────────────────────────────────────

type TwoStep = 'INIT' | 'DONE' | 'ERROR';
const twoStepConfig: Record<TwoStep, StateConfig> = {
  INIT:  { terminal: false, initial: true },
  DONE:  { terminal: true,  initial: false },
  ERROR: { terminal: true,  initial: false },
};

type WithWait = 'INIT' | 'WAIT' | 'DONE' | 'ERROR';
const withWaitConfig: Record<WithWait, StateConfig> = {
  INIT:  { terminal: false, initial: true },
  WAIT:  { terminal: false, initial: false },
  DONE:  { terminal: true,  initial: false },
  ERROR: { terminal: true,  initial: false },
};

type Chain = 'INIT' | 'A' | 'B' | 'C' | 'DONE' | 'ERROR';
const chainConfig: Record<Chain, StateConfig> = {
  INIT:  { terminal: false, initial: true },
  A:     { terminal: false, initial: false },
  B:     { terminal: false, initial: false },
  C:     { terminal: false, initial: false },
  DONE:  { terminal: true,  initial: false },
  ERROR: { terminal: true,  initial: false },
};

type Conflict = 'INIT' | 'A' | 'B' | 'DONE' | 'ERROR';
const conflictConfig: Record<Conflict, StateConfig> = {
  INIT:  { terminal: false, initial: true },
  A:     { terminal: false, initial: false },
  B:     { terminal: false, initial: false },
  DONE:  { terminal: true,  initial: false },
  ERROR: { terminal: true,  initial: false },
};

// ─── Context ─────────────────────��──────────────────

interface Input { value: string }
interface Middle { value: string }
const Input = flowKey<Input>('Input');
const Middle = flowKey<Middle>('Middle');

// ─── Helpers ────────────────────────────────────────

function ok<S extends string>(name: string, requires: any[], produces: any[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}

function failing<S extends string>(name: string, requires: any[]): StateProcessor<S> {
  return {
    name, requires, produces: [Middle],
    process(ctx: FlowContext) {
      ctx.put(Middle, { value: 'dirty' });
      throw new Error('processor failed');
    },
  };
}

// ─── Tests ──────────────────────────────────────────

describe('FlowEngineError', () => {
  it('processorThrows — routes to error state', async () => {
    const def = Tramli.define<TwoStep>('err1', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').auto('DONE', failing('FailProc', [Input]))
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    expect(flow.currentState).toBe('ERROR');
    expect(flow.isCompleted).toBe(true);
  });

  it('processorThrows — context is restored', async () => {
    const def = Tramli.define<TwoStep>('err2', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').auto('DONE', failing('FailProc', [Input]))
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    expect(flow.context.find(Middle)).toBeUndefined();
    expect(flow.context.find(Input)).toBeDefined();
  });

  it('branchReturnsUnknownLabel — routes to error state', async () => {
    const badBranch: BranchProcessor<TwoStep> = {
      name: 'BadBranch',
      requires: [Input],
      decide() { return 'nonexistent'; },
    };

    const def = Tramli.define<TwoStep>('err3', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').branch(badBranch)
        .to('DONE', 'ok')
        .to('ERROR', 'fail')
        .endBranch()
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    expect(flow.currentState).toBe('ERROR');
    expect(flow.isCompleted).toBe(true);
  });

  it('long auto chain — completes successfully', async () => {
    const def = Tramli.define<Chain>('chain', chainConfig)
      .initiallyAvailable(Input)
      .from('INIT').auto('A', ok('p1', [Input], []))
      .from('A').auto('B', ok('p2', [], []))
      .from('B').auto('C', ok('p3', [], []))
      .from('C').auto('DONE', ok('p4', [], []))
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    expect(flow.currentState).toBe('DONE');
    expect(flow.isCompleted).toBe(true);
  });

  it('ttlExpired — resume completes as EXPIRED', async () => {
    const def = Tramli.define<WithWait>('ttl', withWaitConfig)
      .setTtl(1)
      .initiallyAvailable(Input)
      .from('INIT').auto('WAIT', ok('p1', [Input], [Middle]))
      .from('WAIT').external('DONE', {
        name: 'G', requires: [Middle], produces: [], maxRetries: 1,
        validate(): GuardOutput { return { type: 'accepted' }; },
      } as TransitionGuard<WithWait>)
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    await new Promise(r => setTimeout(r, 10));

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.exitState).toBe('EXPIRED');
    expect(resumed.isCompleted).toBe(true);
  });

  it('guardRejectedMaxRetries — routes to error state', async () => {
    const def = Tramli.define<WithWait>('reject', withWaitConfig)
      .setTtl(3600000)
      .setMaxGuardRetries(2)
      .initiallyAvailable(Input)
      .from('INIT').auto('WAIT', ok('p1', [Input], [Middle]))
      .from('WAIT').external('DONE', {
        name: 'AlwaysReject', requires: [Middle], produces: [], maxRetries: 2,
        validate(): GuardOutput { return { type: 'rejected', reason: 'nope' }; },
      } as TransitionGuard<WithWait>)
      .onAnyError('ERROR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, { value: 'x' }]]));

    const r1 = await engine.resumeAndExecute(flow.id, def);
    expect(r1.currentState).toBe('WAIT');
    expect(r1.isCompleted).toBe(false);

    const r2 = await engine.resumeAndExecute(flow.id, def);
    expect(r2.currentState).toBe('ERROR');
    expect(r2.isCompleted).toBe(true);
  });

  it('autoAndExternalConflict — build fails', () => {
    expect(() =>
      Tramli.define<Conflict>('conflict', conflictConfig)
        .initiallyAvailable(Input)
        .from('INIT').auto('A', ok('p1', [Input], []))
        .from('A').auto('B', ok('p2', [], []))
        .from('A').external('DONE', {
          name: 'G', requires: [], produces: [], maxRetries: 1,
          validate(): GuardOutput { return { type: 'accepted' }; },
        } as TransitionGuard<Conflict>)
        .from('B').auto('DONE', ok('p3', [], []))
        .onAnyError('ERROR')
        .build()
    ).toThrow(FlowError);
  });

  // ─── Error Path Data-Flow Analysis ──────────────────

  it('error path requires unsatisfied — build fails', () => {
    type ErrPath = 'START' | 'MID' | 'ERR' | 'DONE';
    const errConfig: Record<ErrPath, StateConfig> = {
      START: { terminal: false, initial: true },
      MID:   { terminal: false, initial: false },
      ERR:   { terminal: false, initial: false },
      DONE:  { terminal: true,  initial: false },
    };
    const ErrMiddle = flowKey<{ v: string }>('ErrMiddle');

    expect(() =>
      Tramli.define<ErrPath>('errpath', errConfig)
        .initiallyAvailable(Input)
        .from('START').auto('MID', ok('P1', [Input], [ErrMiddle]))
        .from('MID').auto('DONE', ok('P2', [ErrMiddle], []))
        .onError('START' as ErrPath, 'ERR' as ErrPath)
        .from('ERR').auto('DONE', ok('ErrProc', [ErrMiddle], []))
        .build()
    ).toThrow(/may not be available/);
  });

  it('error path to terminal — build succeeds', () => {
    const def = Tramli.define<TwoStep>('errterm', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').auto('DONE', ok('P1', [Input], [Middle]))
      .onAnyError('ERROR')
      .build();

    expect(def).toBeDefined();
  });
});
