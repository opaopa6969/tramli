import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verdict } from './oracle.mjs';

export const DEFAULT_SEED = 153;
export const contract = (requires = [], produces = []) => ({ requires, produces });
const state = i => `S${i}`;
const type = i => `T${i}`;
const auto = (from, to, processor = contract()) => ({ kind: 'auto', from: state(from), to: state(to), processor });

// Mulberry32: all arithmetic is explicitly reduced to unsigned 32 bits.
export function generate(seed, count) {
  let value = seed >>> 0;
  const random = n => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n);
  };
  const types = () => Array.from({ length: 6 }, (_, i) => type(i)).filter(() => random(6) === 0);
  const data = () => contract(types(), types());
  return Array.from({ length: count }, (_, index) => {
    const n = 2 + random(7);
    const c = {
      id: `seed-${seed}-${String(index).padStart(5, '0')}`,
      family: 'random',
      states: Array.from({ length: 8 }, (_, i) => ({ name: state(i), initial: i === 0, terminal: i >= n - 1 })),
      transitions: [], onError: [], onStepError: [],
      initiallyAvailable: types(), externallyProvided: types(),
      allowPerpetual: random(5) === 0, allowUnreachable: random(5) === 0,
    };
    if (index % 5 === 0) {
      // A producer path is visited before a poorer path into the same join.
      const t = type(random(6));
      c.family = ['join', 'on-error-join', 'step-error-join', 'step-error-reach', 'valid-chain', 'branch-error', 'guard-error', 'guard-processor-error'][Math.floor(index / 5) % 8];
      c.states.forEach((s, i) => { s.initial = i === 0; s.terminal = i >= 3; });
      c.initiallyAvailable = []; c.externallyProvided = [];
      c.allowPerpetual = false; c.allowUnreachable = false;
      c.transitions = [auto(0, 1, contract([], [t])), auto(1, 2), auto(2, 3, contract([t]))];
      if (c.family === 'join') {
        c.transitions = [
          { kind: 'branch', from: 'S0', branch: { requires: [] }, targets: [{ label: 'producer', to: 'S1' }, { label: 'direct', to: 'S2' }] },
          auto(1, 2, contract([], [t])), auto(2, 3, contract([t])),
        ];
        if (random(2)) c.transitions[0].targets.reverse();
      }
      if (c.family === 'on-error-join') c.onError.push({ from: 'S0', to: 'S2' });
      if (c.family === 'step-error-join') c.onStepError.push({ from: 'S0', to: 'S2' });
      if (c.family === 'step-error-reach') {
        c.transitions = [auto(0, 3), auto(1, 2), auto(2, 3)];
        c.onStepError.push({ from: 'S0', to: 'S1' });
      }
      if (c.family === 'branch-error') {
        c.transitions = [
          { kind: 'branch', from: 'S0', branch: { requires: [] }, targets: [{ label: 'next', to: 'S1' }, { label: 'done', to: 'S3' }] },
          auto(1, 3), auto(2, 3, contract([t])),
        ];
        c.onError = [{ from: 'S0', to: 'S2' }];
      }
      if (c.family === 'guard-error' || c.family === 'guard-processor-error') {
        c.transitions = [
          { kind: 'external', from: 'S0', to: 'S1', guard: contract([], [t]), ...(c.family === 'guard-processor-error' ? { processor: contract() } : {}) },
          auto(1, 3), auto(2, 3, contract([t])),
        ];
        c.onError = [{ from: 'S0', to: 'S2' }];
      }
      return c;
    }
    if (random(12) === 0) c.states[0].initial = false;
    if (random(6) === 0) c.states.slice(0, n).forEach(s => { s.terminal = false; });
    for (let j = 0, m = 1 + random(n * 2); j < m; j++) {
      const from = state(random(n)), to = state(random(n));
      const kind = ['auto', 'external', 'branch'][random(3)];
      if (kind === 'branch') {
        c.transitions.push({ kind, from, branch: { requires: types() }, targets: Array.from({ length: 1 + random(3) }, (_, k) => ({ label: `b${k}`, to: state(random(n)) })) });
      } else if (kind === 'external') {
        c.transitions.push({ kind, from, to, guard: data(), ...(random(2) ? { processor: data() } : {}) });
      } else c.transitions.push({ kind, from, to, processor: data() });
    }
    for (let j = 0; j < n; j++) {
      if (random(5) === 0) c.onError.push({ from: state(j), to: state(random(n)) });
      if (random(4) === 0) c.onStepError.push({ from: state(j), to: state(random(n)) });
    }
    return c;
  });
}

export function expected(cases) {
  return { verdicts: Object.fromEntries(cases.map(c => [c.id, verdict(c)])), knownMismatches: {} };
}
export function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
export function writeCases(path, cases) { writeFileSync(path, `[\n${cases.map(c => JSON.stringify(c)).join(',\n')}\n]\n`); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, seed = '153', count = '500'] = process.argv.slice(2);
  if (!directory || !/^\d+$/.test(seed) || !/^[1-9]\d*$/.test(count)) throw new Error('Usage: node generate.mjs OUTPUT_DIRECTORY [SEED] [COUNT]');
  const cases = generate(Number(seed), Number(count));
  writeCases(`${directory}/corpus.json`, cases);
  writeJson(`${directory}/expected.json`, expected(cases));
}
