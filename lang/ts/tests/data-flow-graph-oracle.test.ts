import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../../../shared-tests/build-verdicts/generate.mjs';
import { edges, verdict } from '../../../shared-tests/build-verdicts/oracle.mjs';
import { available, probe } from '../../../shared-tests/data-flow-graph/oracle.mjs';
import { expected } from '../../../shared-tests/data-flow-graph/generate.mjs';

const corpus = JSON.parse(readFileSync(new URL('../../../shared-tests/build-verdicts/corpus.json', import.meta.url), 'utf8'));
const committed = JSON.parse(readFileSync(new URL('../../../shared-tests/data-flow-graph/expected.json', import.meta.url), 'utf8'));
type Case = typeof corpus[number];

// Independent reference: enumerate reachable (state, concrete type mask) pairs and
// intersect the masks per state, instead of intersecting sets while propagating.
function pathAvailability(c: Case): Record<string, string[]> {
  const mask = (types: string[] = []) => types.reduce((m, t) => m | (1 << Number(t.slice(1))), 0);
  const initial = c.states.find((s: { initial: boolean }) => s.initial)?.name;
  if (!initial) return {};
  const ts = edges(c), seen = new Set<string>(), meet = new Map<string, number>();
  const todo: [string, number][] = [[initial, mask(c.initiallyAvailable)]];
  while (todo.length) {
    const [s, before] = todo.pop()!;
    if (seen.has(`${s}:${before}`)) continue;
    seen.add(`${s}:${before}`);
    meet.set(s, (meet.get(s) ?? before) & before);
    const outgoing = ts.filter(t => t.from === s);
    for (const t of outgoing) {
      const external = t.kind === 'external' ? mask(c.externallyProvided) : 0;
      todo.push([t.to, before | external | mask(t.guard?.produces) | mask(t.processor?.produces)]);
    }
    if (outgoing.length && !c.states.find((v: { name: string }) => v.name === s).terminal) {
      for (const r of [...c.onError, ...c.onStepError]) if (r.from === s) todo.push([r.to, before]);
    }
  }
  const names = Array.from({ length: 8 }, (_, i) => `T${i}`);
  return Object.fromEntries([...meet].sort(([a], [b]) => (a < b ? -1 : 1)).map(([s, m]) => [s, names.filter((_, i) => m & (1 << i))]));
}

const STRUCTURAL = new Set(['NO_INITIAL_STATE', 'DAG_CYCLE', 'AUTO_EXTERNAL_CONFLICT', 'TERMINAL_OUTGOING', 'EXTERNAL_REQUIRES_NOT_DISTINCT']);

describe('data-flow graph specification oracle', () => {
  it('reproduces the committed expectations without using any implementation', () => {
    expect(expected(corpus)).toEqual(committed);
  });

  it('agrees with exhaustive finite path enumeration, including cycles and error routes', () => {
    for (const c of [...corpus, ...generate(170, 2000)]) expect(available(c), c.id).toEqual(pathAvailability(c));
  });

  it('probes keep every guaranteed set and fail only structural checks', () => {
    for (const c of corpus) {
      const p = probe(c);
      expect(available(p), c.id).toEqual(available(c));
      for (const [code] of verdict(p).errors) expect(STRUCTURAL.has(code), `${c.id}: ${code}`).toBe(true);
    }
  });

  it('covers narrower joins and states reached only by exception routes', () => {
    const family = (name: string) => corpus.filter((c: Case) => c.family === name);
    for (const c of family('join')) expect(committed[c.id], c.id).toEqual({ builds: true, available: { S0: [], S1: [], S2: [], S3: [] } });
    for (const c of family('step-error-reach')) expect(Object.keys(committed[c.id].available), c.id).toContain('S1');
    expect(family('join').length).toBeGreaterThan(0);
  });
});
