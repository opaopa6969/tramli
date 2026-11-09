import { describe, expect, it } from 'vitest';
import { FlowDefinition } from '../src/flow-definition.js';
import { FlowEngine } from '../src/flow-engine.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor } from '../src/types.js';

type S = 'WAIT' | 'NEXT' | 'DONE' | 'TYPED_ERROR' | 'ERROR';
const states: Record<S, StateConfig> = {
  WAIT: { initial: true, terminal: false },
  NEXT: { terminal: false },
  DONE: { terminal: true },
  TYPED_ERROR: { terminal: true },
  ERROR: { terminal: true },
};
const Input = flowKey<string>('Input');
const Produced = flowKey<number>('Produced');
const Event = flowKey<string>('Event');
class ProcessorError extends Error {}

describe('unguarded External processor', () => {
  it('runs before the downstream consumer', async () => {
    let calls = 0;
    let consumed = 0;
    const producer: StateProcessor<S> = {
      name: 'produce', requires: [], produces: [Produced],
      async process(ctx) {
        await Promise.resolve();
        calls++;
        ctx.put(Produced, 42);
      },
    };
    const def = FlowDefinition.builder<S>('unguarded-success', states)
      .allowUnreachable()
      .from('WAIT').auto('NEXT', producer)
      .from('NEXT').auto('DONE', {
        name: 'consume', requires: [Produced], produces: [],
        process(ctx) { consumed = ctx.get(Produced); },
      })
      .build();
    // The fluent external builder requires a guard, but public transitions do not.
    def.transitions[0].type = 'external';
    const engine = new FlowEngine(new InMemoryFlowStore());
    const flow = await engine.startFlow(def, 'session', new Map());
    expect(flow.currentState).toBe('WAIT');
    expect(calls).toBe(0);

    const resumed = await engine.resumeAndExecute(flow.id, def);

    expect(calls).toBe(1);
    expect(consumed).toBe(42);
    expect(resumed.context.get(Produced)).toBe(42);
    expect(resumed.currentState).toBe('DONE');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.lastError).toBeNull();
  });

  it.each([
    [new ProcessorError('processor failed'), 'TYPED_ERROR'],
    [new Error('processor failed'), 'ERROR'],
  ] as const)('restores context and routes %s to %s', async (failure, target) => {
    let calls = 0;
    const def = FlowDefinition.builder<S>('unguarded-failure', states)
      .allowUnreachable()
      .initiallyAvailable(Input)
      .from('WAIT').auto('DONE', {
        name: 'failAfterWrites', requires: [Input], produces: [Produced],
        async process(ctx) {
          await Promise.resolve();
          calls++;
          expect(ctx.get(Input)).toBe('external');
          ctx.put(Input, 'dirty');
          ctx.put(Produced, 42);
          throw failure;
        },
      })
      .onStepError('WAIT', ProcessorError, 'TYPED_ERROR')
      .onError('WAIT', 'ERROR')
      .build();
    def.transitions[0].type = 'external';
    const store = new InMemoryFlowStore();
    const engine = new FlowEngine(store);
    const flow = await engine.startFlow(def, 'session', new Map([[Input, 'initial']]));

    const resumed = await engine.resumeAndExecute(flow.id, def,
      new Map([[Input, 'external'], [Event, 'event']]));

    expect(calls).toBe(1);
    expect(resumed.currentState).toBe(target);
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.context.snapshot()).toEqual(new Map([[Input, 'external'], [Event, 'event']]));
    expect(resumed.lastError).toContain('processor failed');
    expect(store.transitionLog.some(t => t.to === 'DONE')).toBe(false);
  });
});
