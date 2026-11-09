/**
 * Regression tests for issue #152: onStepError routes must be traversed by the
 * reachability, path-to-terminal and requires/produces checks, exactly like the
 * onError fallback (guard produces available, processor produces not).
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, FlowKey } from '../src/types.js';

const P = flowKey<string>('P');
class Boom extends Error {}

type S = 'A' | 'B' | 'X' | 'RECOVER' | 'DONE';
const cfg: Record<S, StateConfig> = {
  A: { terminal: false, initial: true },
  B: { terminal: false }, X: { terminal: false }, RECOVER: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, requires: FlowKey<unknown>[], produces: FlowKey<unknown>[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}

describe('onStepError data-flow validation (issue #152)', () => {
  it('rejects requires that the exception path cannot satisfy', () => {
    // Normal path A -> B -> X carries P, but a failure at A routes straight to X without P.
    const { definition, errors } = Tramli.define<S>('ex-route', cfg)
      .from('A').auto('B', proc('makeP', [], [P]))
      .from('B').auto('X', proc('toX', [], []))
      .from('X').auto('DONE', proc('needsP', [P], []))
      .from('RECOVER').auto('DONE', proc('unused', [], []))
      .onStepError('A', Boom, 'X')
      .onStepError('B', Boom, 'RECOVER')
      .buildAndValidate();
    expect(definition).toBeNull();
    expect(errors.some(e => e.code === 'MISSING_REQUIRES' && e.message.includes("Processor 'needsP' at X"))).toBe(true);
  });

  it('treats a state reachable only through an exception route as reachable', () => {
    const def = Tramli.define<S>('ex-only', cfg)
      .from('A').auto('B', proc('step', [], []))
      .from('B').auto('X', proc('toX', [], []))
      .from('X').auto('DONE', proc('finish', [], []))
      .from('RECOVER').auto('DONE', proc('recover', [], []))
      .onStepError('A', Boom, 'RECOVER')
      .build();
    expect(def.name).toBe('ex-only');
  });

  it('lets data available before the failing step reach the exception route', () => {
    const { definition, errors } = Tramli.define<S>('ex-route-ok', cfg)
      .initiallyAvailable(P)
      .from('A').auto('B', proc('step', [], []))
      .from('B').auto('X', proc('toX', [], []))
      .from('X').auto('DONE', proc('needsP', [P], []))
      .from('RECOVER').auto('DONE', proc('recover', [P], []))
      .onStepError('A', Boom, 'RECOVER')
      .buildAndValidate();
    expect(errors).toEqual([]);
    expect(definition).not.toBeNull();
  });
});
