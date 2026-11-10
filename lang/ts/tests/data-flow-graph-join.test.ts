/**
 * Regression tests for issue #170: DataFlowGraph must compute the same guaranteed
 * sets as the build() requires/produces check. When a join state is revisited with
 * a narrower available set, availableAt() must shrink, regardless of which incoming
 * path is traversed first, and traversal must still stop on cyclic flows.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { flowKey } from '../src/flow-key.js';
import type { Builder } from '../src/flow-definition.js';
import type { StateConfig, StateProcessor, TransitionGuard, BranchProcessor, GuardOutput, FlowKey } from '../src/types.js';

const P = flowKey<string>('P');
const Q = flowKey<string>('Q');

type S = 'A' | 'B' | 'J' | 'DONE';
const cfg: Record<S, StateConfig> = {
  A: { terminal: false, initial: true }, B: { terminal: false }, J: { terminal: false },
  DONE: { terminal: true },
};

function proc(name: string, produces: FlowKey<unknown>[] = []): StateProcessor<S> {
  return { name, requires: [], produces, process() {} };
}
function guard(name: string, produces: FlowKey<unknown>[] = []): TransitionGuard<S> {
  return { name, requires: [], produces, maxRetries: 1, validate(): GuardOutput { return { type: 'accepted', data: new Map() }; } };
}
const route: BranchProcessor<S> = { name: 'route', requires: [], decide: () => 'j' };

function branchJoin(richPathFirst: boolean) {
  const b = Tramli.define<S>('join', cfg).from('A').branch(route);
  const branched = richPathFirst ? b.to('B', 'b').to('J', 'j') : b.to('J', 'j').to('B', 'b');
  return branched.endBranch()
    .from('B').auto('J', proc('makeP', [P]))
    .from('J').auto('DONE', proc('finish'))
    .build();
}

function externalJoin(richPathFirst: boolean) {
  // Issue reproduction: A -> J produces P, A -> B -> J does not.
  const rich = (b: Builder<S>) => b.from('A').externalOn(flowKey('Direct'), 'J', guard('direct', [P]));
  const poor = (b: Builder<S>) => b.from('A').externalOn(flowKey('Detour'), 'B', guard('detour'));
  let b = Tramli.define<S>('external-join', cfg);
  b = richPathFirst ? poor(rich(b)) : rich(poor(b));
  return b.from('B').externalOn(flowKey('Return'), 'J', guard('return'))
    .from('J').externalOn(flowKey('Finish'), 'DONE', guard('finish'))
    .build();
}

describe('DataFlowGraph join with a narrower incoming set (issue #170)', () => {
  for (const richPathFirst of [true, false]) {
    it(`shrinks availableAt at a branch join (rich path first: ${richPathFirst})`, () => {
      const graph = branchJoin(richPathFirst).dataFlowGraph!;
      expect(graph.availableAt('B')).toEqual(new Set());
      expect(graph.availableAt('J')).toEqual(new Set());
      expect(graph.availableAt('DONE')).toEqual(new Set());
    });

    it(`shrinks availableAt at an external join (rich path first: ${richPathFirst})`, () => {
      const graph = externalJoin(richPathFirst).dataFlowGraph!;
      expect(graph.availableAt('J')).toEqual(new Set());
      expect(graph.availableAt('DONE')).toEqual(new Set());
    });
  }

  it('stops on a produces self-loop and still shrinks the join', () => {
    // A -> B -> J carries P, A -> J carries nothing, and J loops on itself adding Q.
    const def = Tramli.define<S>('loop-join', cfg)
      .from('A').externalOn(flowKey('ToB'), 'B', guard('toB', [P]))
      .from('A').externalOn(flowKey('ToJ'), 'J', guard('toJ'))
      .from('B').externalOn(flowKey('FromB'), 'J', guard('fromB'))
      .from('J').externalOn(flowKey('Again'), 'J', guard('again', [Q]))
      .from('J').externalOn(flowKey('Finish'), 'DONE', guard('finish'))
      .build();
    const graph = def.dataFlowGraph!;
    expect(graph.availableAt('B')).toEqual(new Set([P]));
    expect(graph.availableAt('J')).toEqual(new Set());
    expect(graph.availableAt('DONE')).toEqual(new Set());
  });
});
