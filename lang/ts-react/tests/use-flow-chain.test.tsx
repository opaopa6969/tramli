import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Tramli, flowKey } from '@unlaxer/tramli';
import type { StateConfig, StateProcessor, TransitionGuard, FlowContext, GuardOutput } from '@unlaxer/tramli';
import { useFlowChain } from '../src/use-flow-chain.js';

// ─── Flow A: session-resume ───────────────────────────
// INIT -> CHECK -> NO_SESSION (terminal) or HAS_SESSION (terminal)

type SA = 'INIT_A' | 'CHECK' | 'NO_SESSION' | 'HAS_SESSION';

const SessionKey = flowKey<{ valid: boolean }>('Session');

const checkProc: StateProcessor<SA> = {
  name: 'CheckSession',
  requires: [],
  produces: [SessionKey],
  process(ctx: FlowContext) {
    ctx.put(SessionKey, { valid: false });
  },
};

function buildFlowA(sessionValid: boolean) {
  const proc: StateProcessor<SA> = {
    name: 'CheckSession',
    requires: [],
    produces: [SessionKey],
    process(ctx: FlowContext) {
      ctx.put(SessionKey, { valid: sessionValid });
    },
  };

  const config: Record<SA, StateConfig> = {
    INIT_A:      { terminal: false, initial: true },
    CHECK:       { terminal: false },
    NO_SESSION:  { terminal: true },
    HAS_SESSION: { terminal: true },
  };

  return Tramli.define<SA>('session-resume', config)
    .setTtl(60_000)
    .from('INIT_A').auto('CHECK', proc)
    .from('CHECK').branch({
      name: 'SessionBranch',
      requires: [SessionKey],
      decide(ctx: FlowContext) {
        return ctx.get(SessionKey).valid ? 'valid' : 'invalid';
      },
    })
      .to('HAS_SESSION', 'valid')
      .to('NO_SESSION', 'invalid')
      .endBranch()
    .build();
}

// ─── Flow B: auth flow ────────────────────────────────
// INIT_B -> AUTHENTICATING -> WAITING_MFA (external) -> AUTHENTICATED

type SB = 'INIT_B' | 'AUTHENTICATING' | 'WAITING_MFA' | 'AUTHENTICATED';

const AuthKey = flowKey<{ token: string }>('Auth');
const MfaKey = flowKey<{ code: string }>('Mfa');

const authProc: StateProcessor<SB> = {
  name: 'Authenticate',
  requires: [],
  produces: [AuthKey],
  process(ctx: FlowContext) {
    ctx.put(AuthKey, { token: 'pending' });
  },
};

const mfaGuard: TransitionGuard<SB> = {
  name: 'MfaGuard',
  requires: [MfaKey],
  produces: [],
  maxRetries: 3,
  validate(ctx: FlowContext): GuardOutput {
    return { type: 'accepted' };
  },
};

function buildFlowB() {
  const config: Record<SB, StateConfig> = {
    INIT_B:         { terminal: false, initial: true },
    AUTHENTICATING: { terminal: false },
    WAITING_MFA:    { terminal: false },
    AUTHENTICATED:  { terminal: true },
  };

  return Tramli.define<SB>('auth-flow', config)
    .setTtl(60_000)
    .initiallyAvailable(MfaKey)
    .from('INIT_B').auto('AUTHENTICATING', authProc)
    .from('AUTHENTICATING').auto('WAITING_MFA')
    .from('WAITING_MFA').external('AUTHENTICATED', mfaGuard)
    .build();
}

// ─── Tests ────────────────────────────────────────────

describe('useFlowChain', () => {
  it('advances to second flow when first reaches matching terminal', async () => {
    const flowA = buildFlowA(false);
    const flowB = buildFlowB();

    const { result } = renderHook(() =>
      useFlowChain([
        { definition: flowA },
        {
          definition: flowB,
          when: (prev) => prev === 'NO_SESSION',
        },
      ]),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepIndex).toBe(1);
    expect(result.current.state).toBe('WAITING_MFA');
  });

  it('stays on first flow when condition does not match', async () => {
    const flowA = buildFlowA(true);
    const flowB = buildFlowB();

    const { result } = renderHook(() =>
      useFlowChain([
        { definition: flowA },
        {
          definition: flowB,
          when: (prev) => prev === 'NO_SESSION',
        },
      ]),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepIndex).toBe(0);
    expect(result.current.state).toBe('HAS_SESSION');
  });

  it('resume works on the current step flow', async () => {
    const flowA = buildFlowA(false);
    const flowB = buildFlowB();

    const { result } = renderHook(() =>
      useFlowChain([
        { definition: flowA },
        {
          definition: flowB,
          when: (prev) => prev === 'NO_SESSION',
        },
      ]),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('WAITING_MFA');
    });

    await act(async () => {
      await result.current.resume([[MfaKey, { code: '123456' }]]);
    });

    expect(result.current.state).toBe('AUTHENTICATED');
    expect(result.current.stepIndex).toBe(1);
  });

  it('single-step chain works like useFlow', async () => {
    const flowA = buildFlowA(true);

    const { result } = renderHook(() =>
      useFlowChain([{ definition: flowA }]),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepIndex).toBe(0);
    expect(result.current.state).toBe('HAS_SESSION');
  });

  it('advances without when (unconditional)', async () => {
    const simpleA = Tramli.define<'START' | 'END'>('simpleA', {
      START: { terminal: false, initial: true },
      END: { terminal: true },
    }).setTtl(60_000).from('START').auto('END').build();

    const simpleB = Tramli.define<'BEGIN' | 'FINISH'>('simpleB', {
      BEGIN: { terminal: false, initial: true },
      FINISH: { terminal: true },
    }).setTtl(60_000).from('BEGIN').auto('FINISH').build();

    const { result } = renderHook(() =>
      useFlowChain([
        { definition: simpleA },
        { definition: simpleB },
      ]),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepIndex).toBe(1);
    expect(result.current.state).toBe('FINISH');
  });
});
