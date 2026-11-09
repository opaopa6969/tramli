/**
 * Regression tests for issue #157: any step leaving a state can fail (processor or
 * branch exception, guard retries exhausted), and the engine restores the context to
 * what it was before the guard ran. Error targets must therefore be checked with
 * exactly the guaranteed set of the failing state.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, BranchProcessor, GuardOutput, FlowKey } from '../src/types.js';

const P = flowKey<string>('P');
const G = flowKey<string>('G');

type S = 'A' | 'B' | 'E' | 'DONE';
const cfg: Record<S, StateConfig> = {
  A: { terminal: false, initial: true }, B: { terminal: false }, E: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, requires: FlowKey<unknown>[], produces: FlowKey<unknown>[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}
const route: BranchProcessor<S> = { name: 'route', requires: [], decide: () => 'b' };
const guard: TransitionGuard<S> = {
  name: 'guard', requires: [], produces: [G], maxRetries: 3,
  validate(): GuardOutput { return { type: 'accepted', data: new Map() }; },
};

function expectRejectedAtE(result: { definition: unknown; errors: { message: string }[] }, processor: string) {
  expect(result.definition).toBeNull();
  expect(result.errors.some(e => e.message.includes(`Processor '${processor}' at E`))).toBe(true);
}

describe('error-path data-flow validation (issue #157)', () => {
  it('checks the error target of a state with only a branch', () => {
    const result = Tramli.define<S>('branch-error', cfg)
      .from('A').branch(route).to('B', 'b').to('DONE', 'd').endBranch()
      .from('B').auto('DONE', proc('fine', [], []))
      .from('E').auto('DONE', proc('needsP', [P], []))
      .onError('A', 'E')
      .buildAndValidate();
    expectRejectedAtE(result, 'needsP');
  });

  it('does not treat guard produces as available on the error path', () => {
    const result = Tramli.define<S>('guard-error', cfg)
      .from('A').external('B', guard, proc('step', [], []))
      .from('B').auto('DONE', proc('fine', [], []))
      .from('E').auto('DONE', proc('needsG', [G], []))
      .onError('A', 'E')
      .buildAndValidate();
    expectRejectedAtE(result, 'needsG');
  });
});
