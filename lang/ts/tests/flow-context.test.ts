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
  it('round trips alias registrations with independent copies and both directions', () => {
    const source = new FlowContext('source');
    source.registerAlias(Alpha, 'alpha');
    source.registerAlias(Beta, 'beta');
    const aliases = source.exportAliases();
    expect(aliases).toEqual(new Map([['alpha', Alpha], ['beta', Beta]]));
    const target = new FlowContext('target');
    target.importAliases(aliases);
    aliases.clear();
    expect(target.exportAliases()).toEqual(source.exportAliases());
    expect(target.aliasOf(Alpha)).toBe('alpha');
    expect(target.keyOfAlias('beta')).toBe(Beta);
    expect(target.snapshot().size).toBe(0);
    target.importAliases(new Map([['renamed', Alpha]]));
    source.registerAlias(Alpha, 'renamed');
    expect(target.exportAliases()).toEqual(source.exportAliases());
    expect(target.aliasOf(Alpha)).toBe(source.aliasOf(Alpha));
  });

  // shared-tests/scenarios/alias-data-round-trip.yaml
  it('alias_data_round_trip', () => {
    const source = new FlowContext('source');
    source.registerAlias(Alpha, 'alpha');
    source.registerAlias(Beta, 'beta');
    source.put(Alpha, { value: 'hello' });
    source.put(Beta, { count: 7 });
    const data = source.toAliasedData();
    expect(data).toEqual(new Map<string, unknown>([
      ['alpha', { value: 'hello' }], ['beta', { count: 7 }],
    ]));
    data.set('unknown', { value: 'ignored' });
    const target = new FlowContext('target');
    target.importAliases(source.exportAliases());
    target.put(Alpha, { value: 'old' });
    target.fromAliasedData(data);
    expect(target.snapshot()).toEqual(source.snapshot());
    data.clear();
    expect(source.toAliasedData().size).toBe(2);
    expect(target.toAliasedData().size).toBe(2);
  });

  it('uses the original key as fallback but ignores unregistered aliases on import', () => {
    const source = new FlowContext('source');
    source.put(Alpha, { value: 'hello' });
    expect(source.toAliasedData()).toEqual(new Map([['Alpha', { value: 'hello' }]]));
    const target = new FlowContext('target');
    target.fromAliasedData(source.toAliasedData());
    expect(target.snapshot().size).toBe(0);
  });

  it('imports data for an empty string key', () => {
    const key = flowKey<string>('');
    const ctx = new FlowContext('empty-key');
    ctx.registerAlias(key, 'empty');
    ctx.fromAliasedData(new Map([['empty', 'value']]));
    expect(ctx.get(key)).toBe('value');
  });

  it('legacy alias maps still contain registrations, never data', () => {
    const source = new FlowContext('source');
    source.registerAlias(Alpha, 'alpha');
    source.put(Alpha, { value: 'hello' });
    source.put(Beta, { count: 7 });
    const aliases = source.toAliasMap();
    expect(aliases).toEqual(new Map([['alpha', Alpha]]));
    const target = new FlowContext('target');
    target.fromAliasMap(aliases);
    expect(target.keyOfAlias('alpha')).toBe(Alpha);
    expect(target.aliasOf(Alpha)).toBe('alpha');
    expect(target.snapshot().size).toBe(0);
    aliases.clear();
    expect(source.toAliasMap()).toEqual(target.toAliasMap());
    target.fromAliasMap(new Map([['renamed', Alpha]]));
    expect(target.keyOfAlias('alpha')).toBe(Alpha);
    expect(target.aliasOf(Alpha)).toBe('renamed');
  });
});
