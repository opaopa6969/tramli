import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateProcessor } from '../src/types.js';
import type { StateLogEntry } from '../src/flow-engine.js';

type S = 'INIT' | 'DONE' | 'ERROR';
const config = { INIT: { initial: true, terminal: false }, DONE: { terminal: true }, ERROR: { terminal: true } };
const Hook = flowKey<number>('Hook');
const GuardData = flowKey<number>('GuardData');
const Existing = flowKey<{ value: string }>('Existing');
const Added = flowKey<{ value: string }>('Added');
const Unchanged = flowKey<{ value: string }>('Unchanged');
function definition(mode: string, fail: boolean) {
  const processor: StateProcessor<S> = {
    name: 'Put', requires: [], produces: [],
    async process(ctx) {
      ctx.put(Existing, { value: 'intermediate' });
      await Promise.resolve();
      ctx.put(Existing, { value: 'final' });
      ctx.put(Added, { value: 'new' });
      ctx.put(Unchanged, ctx.get(Unchanged));
      if (fail) throw new Error('failed');
    },
  };
  const b = Tramli.define<S>('state-logger', config).onAnyError('ERROR')
    .onStateExit('INIT', ctx => ctx.put(Hook, 1))
    .onStateEnter('DONE', ctx => ctx.put(Hook, 2));
  if (mode === 'auto') b.from('INIT').auto('DONE', processor);
  else if (mode === 'branch') b.from('INIT').branch({ name: 'Choose', requires: [], decide: () => 'run' })
    .to('DONE', 'skip').to('DONE', 'run', processor).endBranch();
  else b.from('INIT').external('DONE', { name: 'Accept', requires: [], produces: [], maxRetries: 3,
    validate: () => ({ type: 'accepted', data: new Map([[GuardData, 5]]) }) }, processor);
  return b.build();
}
const initialData = () => new Map<string, unknown>([[Existing, { value: 'original' }], [Unchanged, { value: 'same' }]]);

describe('stateLogger', () => {
  for (const mode of ['auto', 'branch', 'external']) {
    it(`${mode}: logs final added and replaced values after success`, async () => {
      const engine = Tramli.engine(new InMemoryFlowStore());
      const entries: StateLogEntry[] = [];
      engine.setStateLogger(e => entries.push(e));
      const def = definition(mode, false);
      let flow = await engine.startFlow(def, 'test', initialData());
      if (mode === 'external') {
        expect(entries).toEqual([]);
        flow = await engine.resumeAndExecute(flow.id, def);
      }
      expect(flow.currentState).toBe('DONE');
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(expect.arrayContaining([
        { flowId: flow.id, flowName: 'state-logger', state: 'INIT', key: Existing, value: { value: 'final' } },
        { flowId: flow.id, flowName: 'state-logger', state: 'INIT', key: Added, value: { value: 'new' } },
      ]));
    });
    it(`${mode}: restores failures without logging`, async () => {
      const engine = Tramli.engine(new InMemoryFlowStore());
      const entries: StateLogEntry[] = [];
      engine.setStateLogger(e => entries.push(e));
      const def = definition(mode, true);
      let flow = await engine.startFlow(def, 'test', initialData());
      if (mode === 'external') flow = await engine.resumeAndExecute(flow.id, def);
      expect(flow.currentState).toBe('ERROR');
      expect(entries).toEqual([]);
      expect(flow.context.get(Existing)).toEqual({ value: 'original' });
      expect(flow.context.has(Added)).toBe(false);
    });
  }
  it('removed logger is not called', async () => {
    const engine = Tramli.engine(new InMemoryFlowStore());
    engine.setStateLogger(() => { throw new Error('logger removed'); });
    engine.removeAllLoggers();
    const flow = await engine.startFlow(definition('auto', false), 'test', initialData());
    expect(flow.currentState).toBe('DONE');
    expect(flow.context.get(Added)).toEqual({ value: 'new' });
  });
  it('produces violation does not log', async () => {
    const engine = Tramli.engine(new InMemoryFlowStore(), { strictMode: true });
    const entries: StateLogEntry[] = [];
    engine.setStateLogger(e => entries.push(e));
    const def = Tramli.define<S>('strict-logger', config)
      .from('INIT').auto('DONE', { name: 'MissingOutput', requires: [], produces: [Added],
        process(ctx) { ctx.put(Existing, { value: 'dirty' }); } })
      .onAnyError('ERROR').build();
    const flow = await engine.startFlow(def, 'test', new Map());
    expect(flow.currentState).toBe('ERROR');
    expect(entries).toEqual([]);
    expect(flow.context.has(Existing)).toBe(false);
  });
});
