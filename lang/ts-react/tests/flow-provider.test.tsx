import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { Tramli, flowKey } from '@unlaxer/tramli';
import type { StateConfig, StateProcessor, FlowContext } from '@unlaxer/tramli';
import { FlowProvider, useFlowContext } from '../src/flow-provider.js';

type S = 'INIT' | 'PROCESSING' | 'DONE';

const config: Record<S, StateConfig> = {
  INIT:       { terminal: false, initial: true },
  PROCESSING: { terminal: false },
  DONE:       { terminal: true },
};

const InputKey = flowKey<{ value: string }>('ProviderInput');
const ResultKey = flowKey<{ ok: boolean }>('ProviderResult');

const proc: StateProcessor<S> = {
  name: 'ProviderProc',
  requires: [InputKey],
  produces: [ResultKey],
  process(ctx: FlowContext) {
    ctx.put(ResultKey, { ok: true });
  },
};

function buildDef() {
  return Tramli.define<S>('provider-test', config)
    .setTtl(60_000)
    .initiallyAvailable(InputKey)
    .from('INIT').auto('PROCESSING', proc)
    .from('PROCESSING').auto('DONE')
    .build();
}

describe('FlowProvider + useFlowContext', () => {
  it('provides flow state to children via context', async () => {
    const def = buildDef();
    const initialData: [typeof InputKey, { value: string }][] = [[InputKey, { value: 'ctx' }]];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FlowProvider definition={def} initialData={initialData}>
        {children}
      </FlowProvider>
    );

    const { result } = renderHook(() => useFlowContext<S>(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('DONE');
    expect(result.current.context).not.toBeNull();
    expect(result.current.context!.get(ResultKey)).toEqual({ ok: true });
  });

  it('throws when useFlowContext is used outside FlowProvider', () => {
    const { result } = renderHook(() => {
      try {
        return useFlowContext();
      } catch (e) {
        return e;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toContain('useFlowContext must be used inside <FlowProvider>');
  });

  it('accepts Map as initialData (backward compat)', async () => {
    const def = buildDef();
    const initialData = new Map<string, unknown>([[InputKey as string, { value: 'map' }]]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FlowProvider definition={def} initialData={initialData}>
        {children}
      </FlowProvider>
    );

    const { result } = renderHook(() => useFlowContext<S>(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toBe('DONE');
  });
});
