import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { MermaidGenerator } from '../src/mermaid-generator.js';
import { flowKey } from '../src/flow-key.js';
import type { StateProcessor, StateConfig } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// Issue #47: view option for unified state / dataflow entry point.

type S = 'a' | 'b' | 'c';
const KNumber = flowKey<number>('Num');
const KString = flowKey<string>('Str');

const stateConfig: Record<S, StateConfig> = {
  a: { terminal: false, initial: true },
  b: { terminal: false },
  c: { terminal: true },
};

const p1: StateProcessor<S> = {
  name: 'p1',
  requires: [],
  produces: [KNumber],
  process(ctx: FlowContext) { ctx.put(KNumber, 1); },
};

const p2: StateProcessor<S> = {
  name: 'p2',
  requires: [KNumber],
  produces: [KString],
  process(ctx: FlowContext) { ctx.put(KString, `n=${ctx.get(KNumber)}`); },
};

function buildFlow() {
  return Tramli.define<S>('view-test', stateConfig)
    .from('a').auto('b', p1)
    .from('b').auto('c', p2)
    .build();
}

describe('Issue #47: MermaidGenerator view option', () => {
  it('default view is state (stateDiagram-v2)', () => {
    const def = buildFlow();
    const out = MermaidGenerator.generate(def);
    expect(out).toContain('stateDiagram-v2');
    expect(out).toMatch(/a --> b/);
  });

  it('view: "state" is equivalent to default', () => {
    const def = buildFlow();
    expect(MermaidGenerator.generate(def, { view: 'state' })).toBe(
      MermaidGenerator.generate(def),
    );
  });

  it('view: "dataflow" produces flowchart with FlowKey edges', () => {
    const def = buildFlow();
    const out = MermaidGenerator.generate(def, { view: 'dataflow' });
    expect(out).toContain('flowchart LR');
    expect(out).toContain('p1');
    expect(out).toContain('Num');
    expect(out).toContain('produces');
    expect(out).toContain('requires');
    expect(out).not.toMatch(/stateDiagram/);
  });

  it('view: "dataflow" === generateDataFlow()', () => {
    const def = buildFlow();
    expect(MermaidGenerator.generate(def, { view: 'dataflow' })).toBe(
      MermaidGenerator.generateDataFlow(def),
    );
  });
});
