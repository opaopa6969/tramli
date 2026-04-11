import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { Pipeline, PipelineException } from '../src/pipeline.js';
import { FlowError } from '../src/flow-error.js';
import { flowKey } from '../src/flow-key.js';
import type { PipelineStep } from '../src/pipeline.js';
import type { FlowContext } from '../src/flow-context.js';

const A = flowKey<{ v: string }>('A');
const B = flowKey<{ v: string }>('B');
const C = flowKey<{ v: string }>('C');

function step(name: string, reqs: any[], prods: any[], fn: (ctx: FlowContext) => void): PipelineStep {
  return { name, requires: reqs, produces: prods, process(ctx) { fn(ctx); } };
}

describe('Pipeline', () => {
  it('happy path', async () => {
    const p = Tramli.pipeline('test')
      .initiallyAvailable(A)
      .step(step('s1', [A], [B], ctx => ctx.put(B, { v: 'from-a' })))
      .step(step('s2', [B], [C], ctx => ctx.put(C, { v: 'from-b' })))
      .build();
    const result = await p.execute(new Map([[A as string, { v: 'input' }]]));
    expect(result.get(C)).toEqual({ v: 'from-b' });
  });

  it('requires not met — build fails', () => {
    expect(() => Tramli.pipeline('bad')
      .step(step('s1', [A], [B], () => {}))
      .build()
    ).toThrow(/not be available/);
  });

  it('step fails — PipelineException', async () => {
    const p = Tramli.pipeline('fail')
      .initiallyAvailable(A)
      .step(step('s1', [A], [B], ctx => ctx.put(B, { v: 'ok' })))
      .step(step('s2', [B], [C], () => { throw new Error('boom'); }))
      .build();
    try {
      await p.execute(new Map([[A as string, { v: 'x' }]]));
      expect.fail('should throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineException);
      expect(e.failedStep).toBe('s2');
      expect(e.completedSteps).toEqual(['s1']);
    }
  });

  it('deadData', () => {
    const p = Tramli.pipeline('dead')
      .initiallyAvailable(A)
      .step(step('s1', [A], [B, C], ctx => { ctx.put(B, { v: 'b' }); ctx.put(C, { v: 'c' }); }))
      .step(step('s2', [B], [], () => {}))
      .build();
    expect(p.dataFlow().deadData().has(C as string)).toBe(true);
  });

  it('mermaid', () => {
    const p = Tramli.pipeline('mmd')
      .initiallyAvailable(A)
      .step(step('parse', [A], [B], ctx => ctx.put(B, { v: '' })))
      .build();
    expect(p.dataFlow().toMermaid()).toContain('flowchart LR');
    expect(p.dataFlow().toMermaid()).toContain('parse');
  });

  it('empty pipeline', async () => {
    const p = Tramli.pipeline('empty').build();
    const result = await p.execute(new Map());
    expect(result).toBeDefined();
  });

  it('strictMode', async () => {
    const p = Tramli.pipeline('strict')
      .initiallyAvailable(A)
      .step(step('bad', [A], [B], () => { /* doesn't put B */ }))
      .build();
    p.setStrictMode(true);
    await expect(p.execute(new Map([[A as string, { v: 'x' }]]))).rejects.toThrow(PipelineException);
  });

  it('asStep', async () => {
    const inner = Tramli.pipeline('inner')
      .initiallyAvailable(A)
      .step(step('s1', [A], [B], ctx => ctx.put(B, { v: 'nested' })))
      .build();
    const outer = Tramli.pipeline('outer')
      .initiallyAvailable(A)
      .step(inner.asStep())
      .step(step('s2', [B], [C], ctx => ctx.put(C, { v: 'final' })))
      .build();
    const result = await outer.execute(new Map([[A as string, { v: 'start' }]]));
    expect(result.get(C)).toEqual({ v: 'final' });
  });

  it('stateLogger', async () => {
    const logged: string[] = [];
    const p = Tramli.pipeline('log')
      .initiallyAvailable(A)
      .step(step('s1', [A], [B], ctx => ctx.put(B, { v: 'v' })))
      .build();
    p.setStateLogger(entry => logged.push(entry.key));
    await p.execute(new Map([[A as string, { v: 'x' }]]));
    expect(logged).toContain('B');
  });
});
