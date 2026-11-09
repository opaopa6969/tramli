/**
 * Regression tests for issue #155: when a join state is revisited with a narrower
 * available set, the guaranteed set must shrink and downstream requires must be
 * re-checked, regardless of which incoming path is traversed first.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, BranchProcessor, FlowKey } from '../src/types.js';

const P = flowKey<string>('P');

type S = 'A' | 'B' | 'J' | 'DONE';
const cfg: Record<S, StateConfig> = {
  A: { terminal: false, initial: true }, B: { terminal: false }, J: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, requires: FlowKey<unknown>[], produces: FlowKey<unknown>[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}
const route: BranchProcessor<S> = { name: 'route', requires: [], decide: () => 'j' };

function join(richPathFirst: boolean) {
  const b = Tramli.define<S>('join', cfg).from('A').branch(route);
  const branched = richPathFirst ? b.to('B', 'b').to('J', 'j') : b.to('J', 'j').to('B', 'b');
  return branched.endBranch()
    .from('B').auto('J', proc('makeP', [], [P]))
    .from('J').auto('DONE', proc('needsP', [P], []))
    .buildAndValidate();
}

describe('join with a narrower incoming set (issue #155)', () => {
  for (const richPathFirst of [true, false]) {
    it(`rejects missing requires (rich path first: ${richPathFirst})`, () => {
      const { definition, errors } = join(richPathFirst);
      expect(definition).toBeNull();
      expect(errors.some(e => e.message.includes("Processor 'needsP' at J"))).toBe(true);
    });
  }
});
