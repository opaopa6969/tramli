# Differential DataFlowGraph availability

These fixtures compare the per-state guaranteed sets of the Java, TypeScript and
Rust `DataFlowGraph` (`availableAt()` / `available_at()`) with an independent
specification. `availableAt()` feeds `FlowInstance.availableData()`,
`assertDataFlow()`, `pruningHints()` and the invariant assertions, so it must
equal the guaranteed sets that the `build()` requires/produces check uses
([issue 170](https://github.com/opaopa6969/tramli/issues/170)).

The cases are the neutral corpus of [`../build-verdicts`](../build-verdicts/README.md)
(same JSON format, same generator). No processor, guard or branch callback executes.

## Files and commands

- `oracle.mjs`: the specification (`available`), the probe transformation
  (`probe`), and the comparison categories (`differences`).
- `generate.mjs`: writes `expected.json` from a corpus.
- `expected.json`: per case `{ "builds": boolean, "available": { "S0": ["T1"] } }`
  for `../build-verdicts/corpus.json`.
- `fuzz.mjs`: generate cases and run them through all three loaders.

The loaders are the `sharedDataFlowGraphs` / `shared data-flow graph availability` /
`shared_data_flow_graphs` tests next to the build-verdict loaders
(`BuildVerdictTest.java`, `build-verdicts.test.ts`, `build_verdicts.rs`), so the
standard test commands run them. `data-flow-graph-oracle.test.ts` checks that
`expected.json` is reproducible and compares the oracle with an independent
exhaustive enumeration of `(state, available-type-mask)` paths.

```sh
node shared-tests/data-flow-graph/fuzz.mjs 153 10000
```

As with build verdicts, the fuzz command writes its corpus, raw outputs, runner
logs, `summary.json` and `mismatches.json` into its own `mktemp -d` directory,
writes no tracked files, applies no skips, and exits nonzero on any discrepancy.
Dependencies must be installed first.

To regenerate the expectations after a reviewed corpus change:

```sh
node shared-tests/data-flow-graph/generate.mjs shared-tests/build-verdicts/corpus.json shared-tests/data-flow-graph/expected.json
```

Never copy implementation output into `expected.json`.

## Specification

`available` is the dataflow fixpoint of `../build-verdicts/oracle.mjs`
(`guaranteed`), rules 4 and 5 there: start with `initiallyAvailable`, intersect
over all incoming paths (including revisits with a strictly smaller set), add
external data before the guard, guard produces before processor produces, and
give every error target of a non-terminal state with outgoing transitions
exactly that state's guaranteed set. A state is listed exactly when data can
reach it; without an initial state the object is empty.

## Probe

Java and Rust expose a graph only for a definition that builds; TypeScript also
returns `diagnosticGraph` for a failed build. Requirements and the
`allowPerpetual` / `allowUnreachable` flags never change a guaranteed set, so
every loader builds a **probe** of each case with all `requires` removed and both
flags set. A probe still fails on structural errors (no initial state, Auto/Branch
cycle, Auto/External conflict, terminal outgoing transition, indistinct external
guards). `builds` is the oracle verdict of the probe, and every loader must agree
with it.

Each loader reports the states listed by `generateInvariantAssertions()` and
`availableAt()` for each of them, or `available: null` when no graph is exposed.
Java and Rust are compared on probes that build; TypeScript on every case.

## Summary categories

Counts are per case; a case can be in several categories.

| Category | Meaning |
| --- | --- |
| `BUILDS` | The probe build verdict differs from the oracle. |
| `EXTRA_TYPE` | `availableAt()` claims a type that is not guaranteed (unsound). |
| `MISSING_TYPE` | `availableAt()` omits a guaranteed type. |
| `EXTRA_STATE` | The graph lists a state that no data reaches. |
| `MISSING_STATE` | The graph omits a state that data reaches. |
| `NO_GRAPH` | A successful build exposed no graph. |

`crossLanguage` compares the three results on cases where every language exposes
a graph.
