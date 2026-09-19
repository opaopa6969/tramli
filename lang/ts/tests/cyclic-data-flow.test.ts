/**
 * Regression tests for issue #114: requires/produces validation must terminate
 * on cyclic flows where a revisit brings a strict superset of the guaranteed set.
 *
 * Shape: START branches to two paths that join at B with partially overlapping data
 * (shrinking B's guaranteed set), and B <-> A form an external/auto cycle whose
 * transitions keep adding data. Before the fix, `checkRequiresProducesFrom`
 * recursed forever (RangeError: Maximum call stack size exceeded).
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, BranchProcessor, GuardOutput, FlowKey } from '../src/types.js';

const X = flowKey<string>('X');
const W = flowKey<string>('W');
const Y = flowKey<string>('Y');
const Z = flowKey<string>('Z');

type S = 'START' | 'A0' | 'C0' | 'A' | 'C' | 'B' | 'DONE';
const cfg: Record<S, StateConfig> = {
  START: { terminal: false, initial: true },
  A0: { terminal: false }, C0: { terminal: false },
  A: { terminal: false }, C: { terminal: false }, B: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, requires: FlowKey<unknown>[], produces: FlowKey<unknown>[]): StateProcessor<S> {
  return { name, requires, produces, process() {} };
}
function guard(name: string, requires: FlowKey<unknown>[], produces: FlowKey<unknown>[]): TransitionGuard<S> {
  return { name, requires, produces, maxRetries: 3, validate(): GuardOutput { return { type: 'accepted', data: new Map() }; } };
}
const route: BranchProcessor<S> = { name: 'route', requires: [], decide: () => 'a' };

function cyclicFlow(doneRequires: FlowKey<unknown>[]) {
  return Tramli.define<S>('cyclic-join', cfg)
    .from('START').branch(route).to('A0', 'a').to('C0', 'c').endBranch()
    .from('A0').auto('A', proc('initA', [], [X]))
    .from('C0').auto('C', proc('initC', [], [X, W]))
    .from('C').auto('B', proc('join', [], []))
    .from('A').auto('B', proc('toB', [], [Y]))
    .from('B').external('A', guard('backGuard', [], [Z]))
    .from('B').external('DONE', guard('doneGuard', doneRequires, []));
}

describe('cyclic flow data-flow validation (issue #114)', () => {
  it('builds when the guaranteed set stops changing on revisit', () => {
    const def = cyclicFlow([X]).build();
    expect(def.name).toBe('cyclic-join');
    // Guaranteed set at B is the intersection of both incoming paths.
    expect(def.dataFlowGraph!.availableAt('B')).toEqual(new Set([X]));
  });

  it('still reports requires that only one join path satisfies', () => {
    const { definition, errors } = cyclicFlow([Y]).buildAndValidate();
    expect(definition).toBeNull();
    expect(errors.map(e => e.message)).toContainEqual(
      expect.stringContaining("Guard 'doneGuard' at B requires Y but it may not be available"),
    );
  });
});
