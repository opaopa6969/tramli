/**
 * Regression tests for issue #170: DataFlowGraph follows error routes like the
 * build() requires/produces check (issues #152 and #157). A step leaving a
 * non-terminal state can fail, the engine restores the context, and every
 * onStepError / onError target receives exactly the guaranteed set of that state.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput, FlowKey } from '../src/types.js';

const I = flowKey<string>('I');
const P = flowKey<string>('P');
const G = flowKey<string>('G');

type S = 'A' | 'B' | 'E' | 'DONE';
const cfg: Record<S, StateConfig> = {
  A: { terminal: false, initial: true }, B: { terminal: false }, E: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, produces: FlowKey<unknown>[] = []): StateProcessor<S> {
  return { name, requires: [], produces, process() {} };
}
const guard: TransitionGuard<S> = {
  name: 'guard', requires: [], produces: [G], maxRetries: 3,
  validate(): GuardOutput { return { type: 'accepted', data: new Map() }; },
};

describe('DataFlowGraph error routes (issue #170)', () => {
  for (const kind of ['onError', 'onStepError'] as const) {
    it(`intersects a join reached by an ${kind} route`, () => {
      // A -> E produces P; the error route A -> E carries only A's guaranteed set.
      const b = Tramli.define<S>(`${kind}-join`, cfg)
        .allowUnreachable() // B is not used
        .from('A').auto('E', proc('makeP', [P]))
        .from('E').auto('DONE', proc('finish'));
      const def = (kind === 'onError' ? b.onError('A', 'E') : b.onStepError('A', Error, 'E')).build();
      expect(def.dataFlowGraph!.availableAt('E')).toEqual(new Set());
      expect(def.dataFlowGraph!.availableAt('DONE')).toEqual(new Set());
    });
  }

  it('tracks a state reached only through an exception route', () => {
    const def = Tramli.define<S>('step-error-reach', cfg)
      .allowUnreachable() // B is not used
      .initiallyAvailable(I)
      .from('A').auto('DONE', proc('work', [P]))
      .from('E').auto('DONE', proc('recover'))
      .onStepError('A', Error, 'E')
      .build();
    const graph = def.dataFlowGraph!;
    expect(graph.availableAt('E')).toEqual(new Set([I]));
    expect(graph.generateInvariantAssertions()).toContain('At state E: context must contain [I]');
  });

  it('does not carry guard produces onto the error path', () => {
    const def = Tramli.define<S>('guard-error', cfg)
      .initiallyAvailable(I)
      .from('A').external('B', guard, proc('step'))
      .from('B').auto('DONE', proc('fine'))
      .from('E').auto('DONE', proc('recover'))
      .onError('A', 'E')
      .build();
    const graph = def.dataFlowGraph!;
    expect(graph.availableAt('B')).toEqual(new Set([I, G]));
    expect(graph.availableAt('E')).toEqual(new Set([I]));
  });
});
