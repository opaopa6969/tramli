import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../../../shared-tests/build-verdicts/generate.mjs';
import { edges, verdict } from '../../../shared-tests/build-verdicts/oracle.mjs';

const corpus = JSON.parse(readFileSync(new URL('../../../shared-tests/build-verdicts/corpus.json', import.meta.url), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('../../../shared-tests/build-verdicts/expected.json', import.meta.url), 'utf8'));

// Independent reference: enumerate (state, concrete type mask), rather than
// intersecting sets at joins. Eight states * 256 type masks bounds cyclic walks.
function pathRequirements(c: typeof corpus[number]): string[][] {
  const mask = (types: string[] = []) => types.reduce((m, t) => m | (1 << Number(t.slice(1))), 0);
  const initial = c.states.find((s: { initial: boolean }) => s.initial)?.name;
  if (!initial) return [];
  const todo: [string, number][] = [[initial, mask(c.initiallyAvailable)]];
  const seen = new Set<string>(), missing = new Set<string>();
  const ts = edges(c);
  while (todo.length) {
    const [s, before] = todo.pop()!;
    const key = `${s}:${before}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const outgoing = ts.filter(t => t.from === s);
    for (const t of outgoing) {
      let current = before | (t.kind === 'external' ? mask(c.externallyProvided) : 0);
      const check = (requires: string[] | undefined, locus: string) => {
        if ((mask(requires) & current) !== mask(requires)) missing.add(locus);
      };
      check(t.guard?.requires, `guard:${t.name}@${s}`);
      current |= mask(t.guard?.produces);
      check(t.branch?.requires, `branch:${t.branchName}@${s}`);
      check(t.processor?.requires, `processor:${t.name}@${s}->${t.to}`);
      todo.push([t.to, current | mask(t.processor?.produces)]);
    }
    if (outgoing.length && !c.states.find((v: { name: string }) => v.name === s).terminal) {
      for (const r of [...c.onError, ...c.onStepError]) if (r.from === s) todo.push([r.to, before]);
    }
  }
  return [...missing].sort().map(locus => ['MISSING_REQUIRES', locus]);
}

describe('build verdict specification oracle', () => {
  it('reproduces the committed corpus and spec verdicts without using any implementation', () => {
    expect(generate(153, 500)).toEqual(corpus);
    expect(Object.keys(expected.verdicts).sort()).toEqual(corpus.map(c => c.id).sort());
    for (const c of corpus) expect(verdict(c), c.id).toEqual(expected.verdicts[c.id]);
    for (const [issue, skip] of Object.entries(expected.knownMismatches)) {
      expect(issue).toMatch(/^\d+$/);
      const entry = skip as { languages: string[]; cases: string[] };
      expect(entry.languages.every(language => ['java', 'ts', 'rust'].includes(language))).toBe(true);
      expect(entry.cases.length).toBe(new Set(entry.cases).size);
      expect(entry.cases.every(id => Object.hasOwn(expected.verdicts, id))).toBe(true);
    }
  });
  it('agrees with exhaustive finite path enumeration, including cycles and joins', () => {
    for (const c of corpus) {
      expect(verdict(c).errors.filter(([code]) => code === 'MISSING_REQUIRES'), c.id).toEqual(pathRequirements(c));
    }
  });
  it('detects the known join and error-path bugs, while accepting valid chains', () => {
    const families = new Set(corpus.map(c => c.family));
    expect([...families].sort()).toEqual(['branch-error', 'guard-error', 'guard-processor-error', 'join', 'on-error-join', 'random', 'step-error-join', 'step-error-reach', 'valid-chain']);
    for (const c of corpus.filter(c => c.family !== 'random')) {
      if (['valid-chain', 'step-error-reach'].includes(c.family)) expect(verdict(c)).toEqual({ ok: true, errors: [] });
      else expect(verdict(c).errors).toEqual([['MISSING_REQUIRES', 'processor:e2@S2->S3']]);
    }
    const orders = corpus.filter(c => c.family === 'join').map(c => c.transitions[0].targets[0].label);
    expect(new Set(orders)).toEqual(new Set(['producer', 'direct']));
  });
});
