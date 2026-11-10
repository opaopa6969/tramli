// DataFlowGraph specification: availableAt() must equal the guaranteed sets of the
// build() requires/produces check, computed by the independent global fixpoint.
import { guaranteed, verdict } from '../build-verdicts/oracle.mjs';

// Requirements and the two check-skipping flags never change a guaranteed set. A
// probe without them builds whenever only requirement, reachability or
// path-to-terminal checks fail, so Java and Rust expose its graph publicly.
export function probe(c) {
  const strip = contract => (contract ? { ...contract, requires: [] } : contract);
  return {
    ...c,
    transitions: c.transitions.map(t => {
      const stripped = { ...t };
      for (const role of ['guard', 'branch', 'processor']) if (t[role]) stripped[role] = strip(t[role]);
      if (t.targets) stripped.targets = t.targets.map(x => (x.processor ? { ...x, processor: strip(x.processor) } : x));
      return stripped;
    }),
    allowPerpetual: true,
    allowUnreachable: true,
  };
}

// Sorted plain object: state name -> sorted type names, one key per reached state.
export function available(c) {
  return Object.fromEntries([...guaranteed(c)]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([state, types]) => [state, [...types].sort()]));
}

export function expectation(c) {
  return { builds: verdict(probe(c)).ok, available: available(c) };
}

// Per-case difference categories between an implementation result and the spec.
// `available: null` means the language exposes no graph for a failed build.
export function differences(actual, wanted) {
  const found = new Set();
  if (actual.builds !== wanted.builds) found.add('BUILDS');
  if (actual.available) {
    const states = new Set([...Object.keys(actual.available), ...Object.keys(wanted.available)]);
    for (const s of states) {
      const got = actual.available[s], want = wanted.available[s];
      if (!want) { found.add('EXTRA_STATE'); continue; }
      if (!got) { found.add('MISSING_STATE'); continue; }
      if (got.some(t => !want.includes(t))) found.add('EXTRA_TYPE');
      if (want.some(t => !got.includes(t))) found.add('MISSING_TYPE');
    }
  } else if (actual.builds) found.add('NO_GRAPH');
  return [...found].sort();
}
