import { describe, it, expect } from 'vitest';
import { FlowContext } from '../src/flow-context.js';
import { FlowError } from '../src/flow-error.js';
import { flowKey } from '../src/flow-key.js';

interface Alpha { value: string }
interface Beta { count: number }
const Alpha = flowKey<Alpha>('Alpha');
const Beta = flowKey<Beta>('Beta');

describe('FlowContext', () => {
  it('put and get', () => {
    const ctx = new FlowContext('f1');
    ctx.put(Alpha, { value: 'hello' });
    expect(ctx.get(Alpha).value).toBe('hello');
  });

  it('get missing throws', () => {
    const ctx = new FlowContext('f1');
    expect(() => ctx.get(Alpha)).toThrow(FlowError);
    try { ctx.get(Alpha); } catch (e: any) { expect(e.code).toBe('MISSING_CONTEXT'); }
  });

  it('find returns undefined for missing', () => {
    const ctx = new FlowContext('f1');
    expect(ctx.find(Alpha)).toBeUndefined();
    ctx.put(Alpha, { value: 'x' });
    expect(ctx.find(Alpha)).toBeDefined();
  });

  it('snapshot and restoreFrom', () => {
    const ctx = new FlowContext('f1');
    ctx.put(Alpha, { value: 'original' });
    const snap = ctx.snapshot();
    ctx.put(Alpha, { value: 'modified' });
    ctx.put(Beta, { count: 1 });
    ctx.restoreFrom(snap);
    expect(ctx.get(Alpha).value).toBe('original');
    expect(ctx.find(Beta)).toBeUndefined();
  });
});
