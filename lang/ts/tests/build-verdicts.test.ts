import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FlowDefinition } from '../src/flow-definition.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard } from '../src/types.js';
import type { DataFlowGraph } from '../src/data-flow-graph.js';
import { probe } from '../../../shared-tests/data-flow-graph/oracle.mjs';

type Contract = { requires: string[]; produces: string[] };
type Target = { to: string; label: string; processor?: Contract };
type Case = {
  id: string; states: ({ name: string } & StateConfig)[];
  transitions: { kind: 'auto' | 'external' | 'branch'; from: string; to: string; processor?: Contract; guard: Contract; branch: { requires: string[] }; targets: Target[] }[];
  onError: { from: string; to: string }[]; onStepError: { from: string; to: string }[];
  initiallyAvailable: string[]; externallyProvided: string[]; allowPerpetual: boolean; allowUnreachable: boolean;
};
type Verdict = { ok: boolean; errors: string[][] };
type Expected = { verdicts: Record<string, Verdict>; knownMismatches: Record<string, { languages: string[]; cases: string[] }> };
type GraphResult = { builds: boolean; available: Record<string, string[]> | null };
const directory = fileURLToPath(new URL('../../../shared-tests/build-verdicts/', import.meta.url));
const graphDirectory = fileURLToPath(new URL('../../../shared-tests/data-flow-graph/', import.meta.url));
const cases: Case[] = JSON.parse(readFileSync(process.env.BUILD_VERDICT_CORPUS ?? resolve(directory, 'corpus.json'), 'utf8'));
const expected: Expected = JSON.parse(readFileSync(resolve(directory, 'expected.json'), 'utf8'));

function normalize(code: string, message: string): string[] {
  if (message.startsWith('No initial state found')) return ['NO_INITIAL_STATE', 'flow'];
  const missing = message.match(/^(Processor|Guard|Branch) '([^']+)' at (S\d+)(?: -> (S\d+))? requires /);
  if (missing) return ['MISSING_REQUIRES', `${missing[1].toLowerCase()}:${missing[2]}@${missing[3]}${missing[4] ? `->${missing[4]}` : ''}`];
  if (code === 'DAG_CYCLE' || code === 'NO_INITIAL_STATE') return [code, 'flow'];
  const outgoing = message.match(/^Terminal state (S\d+) has an outgoing transition to (S\d+)/);
  if (outgoing) return ['TERMINAL_OUTGOING', `${outgoing[1]}->${outgoing[2]}`];
  const state = message.match(/^(?:State |No path from )(S\d+)/);
  if (state) return [code, state[1]];
  throw new Error(`Unrecognized diagnostic: ${code}: ${message}`);
}
function build(c: Case) {
  const builder = FlowDefinition.builder(c.id, Object.fromEntries(c.states.map(s => [s.name, { initial: s.initial, terminal: s.terminal }])));
  builder.initiallyAvailable(...c.initiallyAvailable.map(flowKey));
  builder.externallyProvided(...c.externallyProvided.map(flowKey));
  if (c.allowPerpetual) builder.allowPerpetual();
  if (c.allowUnreachable) builder.allowUnreachable();
  const processor = (name: string, p: Contract): StateProcessor<string> => ({ name, requires: p.requires.map(flowKey), produces: p.produces.map(flowKey), process() { throw new Error('Validation must not execute processors'); } });
  for (const [i, t] of c.transitions.entries()) {
    const name = `e${i}`;
    if (t.kind === 'auto') builder.from(t.from).auto(t.to, processor(name, t.processor!));
    else if (t.kind === 'external') {
      const guard: TransitionGuard<string> = { name, requires: t.guard.requires.map(flowKey), produces: t.guard.produces.map(flowKey), maxRetries: 3, validate() { throw new Error('Validation must not execute guards'); } };
      builder.from(t.from).external(t.to, guard, t.processor ? processor(name, t.processor) : undefined);
    } else {
      const branch = builder.from(t.from).branch({ name, requires: t.branch.requires.map(flowKey), decide() { throw new Error('Validation must not execute branches'); } });
      t.targets.forEach((target, j) => branch.to(target.to, target.label, target.processor ? processor(`${name}b${j}`, target.processor) : undefined));
      branch.endBranch();
    }
  }
  for (const r of c.onError) builder.onError(r.from, r.to);
  for (const r of c.onStepError) builder.onStepError(r.from, Error, r.to);
  return builder;
}
function verdict(c: Case): Verdict {
  const result = build(c).buildAndValidate();
  // Also exercise the throwing API: a structured result must agree with build().
  let ok = true;
  try { build(c).build(); } catch { ok = false; }
  expect(ok, `${c.id}: build/buildAndValidate parity`).toBe(result.errors.length === 0);
  expect(Boolean(result.definition)).toBe(ok);
  const unique = new Map(result.errors.map(e => { const pair = normalize(e.code, e.message); return [pair.join('|'), pair]; }));
  return { ok, errors: [...unique.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, pair]) => pair) };
}

// Every state the graph tracks, with availableAt() for it (both sorted).
function availableStates(graph: DataFlowGraph<string>): Record<string, string[]> {
  const states = graph.generateInvariantAssertions().map(a => /^At state (\S+):/.exec(a)![1]).sort();
  return Object.fromEntries(states.map(s => [s, [...graph.availableAt(s)].sort()]));
}
// The probe drops requires and the two flags, which cannot change any guaranteed
// set. TypeScript also exposes the diagnostic graph of a failed build.
function graphResult(c: Case): GraphResult {
  const result = build(probe(c) as Case).buildAndValidate();
  const graph = result.definition?.dataFlowGraph ?? result.diagnosticGraph;
  return { builds: result.errors.length === 0, available: graph ? availableStates(graph) : null };
}

describe('shared build verdicts', () => {
  if (process.env.BUILD_VERDICT_OUTPUT) {
    it('exports every verdict without skips', () => {
      writeFileSync(process.env.BUILD_VERDICT_OUTPUT!, JSON.stringify(Object.fromEntries(cases.map(c => [c.id, verdict(c)]))));
    }, 120_000);
  } else {
    for (const c of cases) {
      const issues = Object.entries(expected.knownMismatches).filter(([, skip]) => skip.languages.includes('ts') && skip.cases.includes(c.id)).map(([issue]) => `#${issue}`);
      it.skipIf(issues.length > 0)(`${c.id}${issues.length ? ` known mismatch ${issues.join(', ')}` : ''}`, () => {
        expect(verdict(c)).toEqual(expected.verdicts[c.id]);
      });
    }
  }
});

describe('shared data-flow graph availability', () => {
  const graphCases: Case[] = JSON.parse(readFileSync(process.env.DATA_FLOW_GRAPH_CORPUS ?? resolve(directory, 'corpus.json'), 'utf8'));
  if (process.env.DATA_FLOW_GRAPH_OUTPUT) {
    it('exports every graph without skips', () => {
      writeFileSync(process.env.DATA_FLOW_GRAPH_OUTPUT!, JSON.stringify(Object.fromEntries(graphCases.map(c => [c.id, graphResult(c)]))));
    }, 120_000);
  } else {
    const wanted: Record<string, GraphResult> = JSON.parse(readFileSync(resolve(graphDirectory, 'expected.json'), 'utf8'));
    for (const c of graphCases) {
      it(c.id, () => {
        expect(graphResult(c)).toEqual(wanted[c.id]);
      });
    }
  }
});
