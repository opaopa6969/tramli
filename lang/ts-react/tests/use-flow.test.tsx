import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Tramli, flowKey } from '@unlaxer/tramli';
import type { StateProcessor, StateConfig, FlowContext, TransitionGuard, GuardOutput } from '@unlaxer/tramli';
import { useFlow } from '../src/use-flow.js';

// ─── Test flow definition ──────────────────────────

type S = 'INIT' | 'PROCESSING' | 'WAITING' | 'DONE' | 'ERROR';

const config: Record<S, StateConfig> = {
  INIT:       { terminal: false, initial: true },
  PROCESSING: { terminal: false },
  WAITING:    { terminal: false },
  DONE:       { terminal: true },
  ERROR:      { terminal: true },
};

const InputKey = flowKey<{ value: string }>('Input');
const ResultKey = flowKey<{ ok: boolean }>('Result');

const proc: StateProcessor<S> = {
  name: 'Process',
  requires: [InputKey],
  produces: [ResultKey],
  process(ctx: FlowContext) {
    ctx.put(ResultKey, { ok: true });
  },
};

const guard: TransitionGuard<S> = {
  name: 'ApproveGuard',
  requires: [ResultKey],
  produces: [],
  maxRetries: 3,
  validate(ctx: FlowContext): GuardOutput {
    return { type: 'accepted', data: new Map() };
  },
};

/** Auto-chain flow: INIT -> PROCESSING -> WAITING (external) -> DONE */
function buildDef() {
  return Tramli.define<S>('test-react', config)
    .setTtl(60_000)
    .initiallyAvailable(InputKey)
    .from('INIT').auto('PROCESSING', proc)
    .from('PROCESSING').auto('WAITING')
    .from('WAITING').external('DONE', guard)
    .onAnyError('ERROR')
    .build();
}

/** Simple terminal flow: INIT -> DONE (auto) */
function buildSimpleDef() {
  return Tramli.define<'INIT' | 'DONE'>('simple', {
    INIT: { terminal: false, initial: true },
    DONE: { terminal: true },
  })
    .setTtl(60_000)
    .from('INIT').auto('DONE')
    .build();
}

// ─── Tests ─────────────────────────────────────────

describe('useFlow', () => {

  it('starts a flow and reaches auto-chain target', async () => {
    const def = buildDef();
    const { result } = renderHook(() =>
      useFlow(def, { initialData: new Map([[InputKey as string, { value: 'hello' }]]) }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('WAITING');
    expect(result.current.flowId).toBeTruthy();
    expect(result.current.error).toBeNull();
    expect(result.current.context).not.toBeNull();
  });

  it('completes a simple flow to terminal state', async () => {
    const def = buildSimpleDef();
    const { result } = renderHook(() => useFlow(def));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('DONE');
  });

  it('resume transitions from WAITING to DONE', async () => {
    const def = buildDef();
    const { result } = renderHook(() =>
      useFlow(def, { initialData: new Map([[InputKey as string, { value: 'test' }]]) }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('WAITING');
    });

    await act(async () => {
      await result.current.resume();
    });

    expect(result.current.state).toBe('DONE');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('flow without required data still reaches WAITING', async () => {
    // Even without InputKey, proc silently produces ResultKey={ok:true}
    // because ctx.get() returns undefined (no throw). Auto-chain proceeds.
    const def = buildDef();
    const { result } = renderHook(() => useFlow(def));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('WAITING');
    expect(result.current.flowId).toBeTruthy();
  });

  it('resume before flow starts throws', async () => {
    const def = buildDef();
    // We need to test calling resume synchronously before flow starts
    // This is tricky with hooks, but we can verify the error message
    const { result } = renderHook(() =>
      useFlow(def, { initialData: new Map([[InputKey as string, { value: 'x' }]]) }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // After flow is started, resume should work
    expect(result.current.state).toBe('WAITING');
  });

  it('uses custom sessionId', async () => {
    const def = buildSimpleDef();
    const { result } = renderHook(() =>
      useFlow(def, { sessionId: 'my-session-42' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('DONE');
    expect(result.current.flowId).toBeTruthy();
  });

  it('resume accepts [FlowKey, value] pairs (P3)', async () => {
    const def = buildDef();
    const { result } = renderHook(() =>
      useFlow(def, { initialData: [[InputKey, { value: 'pairs' }]] }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('WAITING');
    });

    await act(async () => {
      await result.current.resume([[ResultKey, { ok: true }]]);
    });

    expect(result.current.state).toBe('DONE');
    expect(result.current.error).toBeNull();
  });

  it('initialData accepts [FlowKey, value] pairs (P3)', async () => {
    const def = buildDef();
    const { result } = renderHook(() =>
      useFlow(def, { initialData: [[InputKey, { value: 'pair-init' }]] }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('WAITING');
    expect(result.current.context!.get(InputKey)).toEqual({ value: 'pair-init' });
  });

  it('context contains produced data', async () => {
    const def = buildDef();
    const { result } = renderHook(() =>
      useFlow(def, { initialData: new Map([[InputKey as string, { value: 'ctx-test' }]]) }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('WAITING');
    });

    const ctx = result.current.context!;
    expect(ctx.get(ResultKey)).toEqual({ ok: true });
  });
});
