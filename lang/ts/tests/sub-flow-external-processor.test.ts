import { describe, expect, it } from 'vitest';
import { FlowDefinition } from '../src/flow-definition.js';
import { FlowEngine } from '../src/flow-engine.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard } from '../src/types.js';

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
const Accepted = flowKey<string>('Accepted');
const guard: TransitionGuard<S> = {
  name: 'accept', requires: [], produces: [Accepted],
  validate() { return { type: 'accepted', data: new Map([[Accepted, 'accepted']]) }; },
};
function parent(child: FlowDefinition<S>) {
  return FlowDefinition.builder<S>('parent', states).allowUnreachable()
    .from('WAIT').subFlow(child).onExit('DONE', 'DONE')
    .onExit('TYPED_ERROR', 'TYPED_ERROR').onExit('ERROR', 'ERROR').endSubFlow()
    .onError('WAIT', 'ERROR').build();
}
class ProcessorError extends Error {}

describe.each([
  { guarded: true, asyncProcessor: true },
  { guarded: true, asyncProcessor: false },
  { guarded: false, asyncProcessor: true },
  { guarded: false, asyncProcessor: false },
])('sub-flow External processor $guarded / async $asyncProcessor', ({ guarded, asyncProcessor }) => {
  it('runs before the downstream consumer', async () => {
    let calls = 0;
    let consumed = 0;
    const producer: StateProcessor<S> = {
      name: 'produce', requires: [], produces: [Produced],
      process(ctx) {
        const run = () => {
          calls++;
          expect(ctx.has(Accepted)).toBe(guarded);
          ctx.put(Produced, 42);
        };
        return asyncProcessor ? Promise.resolve().then(run) : run();
      },
    };
    const child = FlowDefinition.builder<S>('child-success', states)
      .allowUnreachable()
      .from('WAIT').external('NEXT', guard, producer)
      .from('NEXT').auto('DONE', {
        name: 'consume', requires: [Produced], produces: [],
        process(ctx) { consumed = ctx.get(Produced); },
      })
      .build();
    // The fluent external builder requires a guard, but public transitions do not.
    if (!guarded) child.transitions[0].guard = undefined;
    const def = parent(child);
    const engine = new FlowEngine(new InMemoryFlowStore());
    const logged: string[] = [];
    if (asyncProcessor) engine.setStateLogger(entry => logged.push(entry.key));
    const flow = await engine.startFlow(def, 'session', new Map());
    expect(flow.currentState).toBe('WAIT');
    expect(calls).toBe(0);

    const resumed = await engine.resumeAndExecute(flow.id, def);

    expect(calls).toBe(1);
    expect(consumed).toBe(42);
    if (asyncProcessor) expect(logged.filter(key => key === Produced)).toHaveLength(1);
    expect(resumed.context.get(Produced)).toBe(42);
    expect(resumed.currentState).toBe('DONE');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.lastError).toBeNull();
  });

  it('bubbles an unhandled processor failure to the parent', async () => {
    const child = FlowDefinition.builder<S>('unhandled', states).allowUnreachable()
      .from('WAIT').external('DONE', guard, {
        name: 'fail', requires: [], produces: [],
        process(ctx) {
          const run = () => { ctx.put(Produced, 42); throw new Error('processor failed'); };
          return asyncProcessor ? Promise.resolve().then(run) : run();
        },
      }).build();
    if (!guarded) child.transitions[0].guard = undefined;
    const def = parent(child);
    const engine = new FlowEngine(new InMemoryFlowStore());
    const flow = await engine.startFlow(def, 'session', new Map());
    await engine.resumeAndExecute(flow.id, def);
    expect(flow.currentState).toBe('ERROR');
    expect(flow.isCompleted).toBe(true);
    expect(flow.activeSubFlow).toBeNull();
    expect(flow.context.snapshot().size).toBe(0);
  });

  it.each([
    [new ProcessorError('processor failed'), 'TYPED_ERROR'],
    [new Error('processor failed'), 'ERROR'],
  ] as const)('restores context and routes %s to %s', async (failure, target) => {
    let calls = 0;
    const child = FlowDefinition.builder<S>('child-failure', states)
      .allowUnreachable()
      .initiallyAvailable(Input)
      .from('WAIT').external('DONE', guard, {
        name: 'failAfterWrites', requires: [Input], produces: [Produced],
        process(ctx) {
          const run = () => {
            calls++;
            expect(ctx.has(Accepted)).toBe(guarded);
            expect(ctx.get(Input)).toBe('external');
            ctx.put(Input, 'dirty');
            ctx.put(Produced, 42);
            throw failure;
          };
          return asyncProcessor ? Promise.resolve().then(run) : run();
        },
      })
      .onStepError('WAIT', ProcessorError, 'TYPED_ERROR')
      .onError('WAIT', 'ERROR')
      .build();
    if (!guarded) child.transitions[0].guard = undefined;
    const def = parent(child);
    const store = new InMemoryFlowStore();
    const engine = new FlowEngine(store);
    const flow = await engine.startFlow(def, 'session', new Map([[Input, 'initial']]));

    const childFlow = flow.activeSubFlow!;
    const resumed = await engine.resumeAndExecute(flow.id, def,
      new Map([[Input, 'external'], [Event, 'event']]));

    expect(calls).toBe(1);
    expect(resumed.currentState).toBe(target);
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.context.snapshot()).toEqual(new Map([[Input, 'external'], [Event, 'event']]));
    expect(childFlow.lastError).toContain('processor failed');
    expect(childFlow.currentState).toBe(target);
    expect(resumed.activeSubFlow).toBeNull();
    expect(store.transitionLog.some(t => t.to === 'DONE')).toBe(false);
  });
});
