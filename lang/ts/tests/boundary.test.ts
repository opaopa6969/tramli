/**
 * Boundary / regression-prone behavior tests for public API.
 * Tests only — no implementation changes. If any test fails, that's a bug (file an issue).
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { FlowContext } from '../src/flow-context.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { FlowError } from '../src/flow-error.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput } from '../src/types.js';
import type { FlowContext as FC } from '../src/flow-context.js';

const Input = flowKey<string>('Input');
const Mid = flowKey<string>('Mid');

function ok<S extends string>(name: string, requires: any[], produces: any[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}

// ─── 1. FlowContext snapshot/restoreFrom on empty context ─────────────────

describe('FlowContext boundary: snapshot/restoreFrom', () => {
  it('restoreFrom on empty snapshot clears all entries', () => {
    const ctx = new FlowContext('f1');
    ctx.put(Input, 'v1');
    ctx.put(Mid, 'v2');
    expect(ctx.has(Input)).toBe(true);
    expect(ctx.has(Mid)).toBe(true);

    const empty = new FlowContext('f2').snapshot(); // empty snapshot
    ctx.restoreFrom(empty);
    expect(ctx.find(Input)).toBeUndefined();
    expect(ctx.find(Mid)).toBeUndefined();
  });
});

// ─── 2. maxChainDepth boundary (9 ok, 11 throws) ───────────────────────────

describe('maxChainDepth boundary', () => {
  it('9 auto transitions complete within default maxChainDepth=10', async () => {
    type S = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9';
    const cfg: Record<S, StateConfig> = {
      S0: { terminal: false, initial: true }, S1: { terminal: false }, S2: { terminal: false },
      S3: { terminal: false }, S4: { terminal: false }, S5: { terminal: false },
      S6: { terminal: false }, S7: { terminal: false }, S8: { terminal: false },
      S9: { terminal: true },
    };
    // 9 transitions: S0 -> ... -> S9 (S9 terminal, reached on 9th transition)
    const def = Tramli.define<S>('chain9', cfg)
      .initiallyAvailable(Input)
      .from('S0').auto('S1', ok('p0', [Input], []))
      .from('S1').auto('S2', ok('p1', [], []))
      .from('S2').auto('S3', ok('p2', [], []))
      .from('S3').auto('S4', ok('p3', [], []))
      .from('S4').auto('S5', ok('p4', [], []))
      .from('S5').auto('S6', ok('p5', [], []))
      .from('S6').auto('S7', ok('p6', [], []))
      .from('S7').auto('S8', ok('p7', [], []))
      .from('S8').auto('S9', ok('p8', [], []))
      .build();
    const engine = Tramli.engine(new InMemoryFlowStore());
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, 'x']]));
    expect(flow.currentState).toBe('S9');
    expect(flow.isCompleted).toBe(true);
  });

  it('11 auto transitions throw MAX_CHAIN_DEPTH', async () => {
    type S = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9'
      | 'S10' | 'S11';
    const cfg: Record<S, StateConfig> = {
      S0: { terminal: false, initial: true }, S1: { terminal: false }, S2: { terminal: false },
      S3: { terminal: false }, S4: { terminal: false }, S5: { terminal: false },
      S6: { terminal: false }, S7: { terminal: false }, S8: { terminal: false },
      S9: { terminal: false }, S10: { terminal: false }, S11: { terminal: true },
    };
    // 11 transitions: depth reaches 11 >= maxChainDepth(10) -> throw
    const def = Tramli.define<S>('chain11', cfg)
      .initiallyAvailable(Input)
      .from('S0').auto('S1', ok('p0', [Input], []))
      .from('S1').auto('S2', ok('p1', [], []))
      .from('S2').auto('S3', ok('p2', [], []))
      .from('S3').auto('S4', ok('p3', [], []))
      .from('S4').auto('S5', ok('p4', [], []))
      .from('S5').auto('S6', ok('p5', [], []))
      .from('S6').auto('S7', ok('p6', [], []))
      .from('S7').auto('S8', ok('p7', [], []))
      .from('S8').auto('S9', ok('p8', [], []))
      .from('S9').auto('S10', ok('p9', [], []))
      .from('S10').auto('S11', ok('p10', [], []))
      .build();
    const engine = Tramli.engine(new InMemoryFlowStore());
    await expect(
      engine.startFlow(def, 's1', new Map([[Input as string, 'x']])),
    ).rejects.toThrow();
  });
});

// ─── 3. GuardOutput.Expired completes flow with EXPIRED ────────────────────

describe('GuardOutput.Expired', () => {
  type S = 'INIT' | 'WAIT' | 'DONE' | 'ERR';
  const cfg: Record<S, StateConfig> = {
    INIT: { terminal: false, initial: true }, WAIT: { terminal: false },
    DONE: { terminal: true }, ERR: { terminal: true },
  };

  it('guard returning Expired completes flow as EXPIRED', async () => {
    const guard: TransitionGuard<S> = {
      name: 'ExpireGuard', requires: [Mid], produces: [], maxRetries: 3,
      validate(): GuardOutput { return { type: 'expired' }; },
    };
    const def = Tramli.define<S>('expire', cfg)
      .setTtl(3600000)
      .initiallyAvailable(Input)
      .from('INIT').auto('WAIT', ok('p', [Input], [Mid]))
      .from('WAIT').external('DONE', guard)
      .onAnyError('ERR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore());
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, 'x']]));
    expect(flow.currentState).toBe('WAIT');

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.exitState).toBe('EXPIRED');
  });
});

// ─── 4. resumeAndExecute on completed flow → FLOW_NOT_FOUND ────────────────

describe('resumeAndExecute on completed flow', () => {
  type S = 'INIT' | 'DONE';
  const cfg: Record<S, StateConfig> = {
    INIT: { terminal: false, initial: true }, DONE: { terminal: true },
  };

  it('resume on completed flow throws FLOW_NOT_FOUND', async () => {
    const def = Tramli.define<S>('complete-all', cfg)
      .initiallyAvailable(Input)
      .from('INIT').auto('DONE', ok('p', [Input], []))
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map([[Input as string, 'x']]));
    expect(flow.currentState).toBe('DONE');
    expect(flow.isCompleted).toBe(true);

    await expect(engine.resumeAndExecute(flow.id, def)).rejects.toThrow();
    try {
      await engine.resumeAndExecute(flow.id, def);
    } catch (e: any) {
      expect(e).toBeInstanceOf(FlowError);
      expect(e.code).toBe('FLOW_NOT_FOUND');
    }
  });
});

// ─── 5. build() with no initial state → NO_INITIAL_STATE ──────────────────

describe('build() with no initial state', () => {
  type S = 'A' | 'B';
  const cfg: Record<S, StateConfig> = {
    A: { terminal: false }, B: { terminal: true },
  };

  it('build fails with NO_INITIAL_STATE', () => {
    expect(() =>
      Tramli.define<S>('no-init', cfg)
        .from('A').auto('B', ok('p', [], []))
        .build()
    ).toThrow();
    // Also check buildAndValidate yields structured error
    const result = Tramli.define<S>('no-init-structured', cfg)
      .from('A').auto('B', ok('p', [], []))
      .buildAndValidate();
    expect(result.definition).toBeNull();
    expect(result.errors.some(e => e.code === 'VALIDATION' || e.message.includes('initial'))).toBe(true);
  });
});
