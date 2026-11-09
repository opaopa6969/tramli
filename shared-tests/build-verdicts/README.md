# Differential build validation

These fixtures compare Java, TypeScript and Rust definition-time validation.
The expected result is specified independently of the implementations: agreement
between three implementations is insufficient if all three violate the contract.
No processor, guard or branch callback executes. The loaders exercise both
`build()` and `buildAndValidate()` / `build_and_validate()`, assert success/failure
parity, and normalize the latter API's complete diagnostic set.

## Files and commands

- `generate.mjs`: deterministic Mulberry32 generator, no npm dependencies.
- `oracle.mjs`: independent finite-set specification evaluator.
- `corpus.json`: 500 cases, seed 153, in declaration order.
- `expected.json`: specification verdicts and issue-keyed known mismatches.
- `fuzz.mjs`: generate and run arbitrary cases through all three test loaders.

From the repository root, install the existing workspace dependencies with
`npm install --legacy-peer-deps`, then run:

```sh
mvn -q -f lang/java/pom.xml test
npm test --workspace=lang/ts
(cd lang/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked)
node shared-tests/build-verdicts/fuzz.mjs 153 10000
```

The existing `.github/workflows/test.yml` jobs discover all three loaders through
these standard test commands. The TypeScript suite also checks corpus
reproducibility and compares the oracle with independent exhaustive enumeration
of `(state, available-type-mask)` paths, including cycles.

To generate a candidate corpus without overwriting reviewed skip decisions:

```sh
candidate_dir=$(mktemp -d)
node shared-tests/build-verdicts/generate.mjs "$candidate_dir" 153 500
```

Generation writes a fresh `expected.json` with **no skips**. Copy the regenerated
verdicts only after comparing them with the committed specification, and retain
only independently justified entries in `knownMismatches`. Never derive expected
verdicts by majority vote or copy observed implementation output into them.

The fuzz command creates its own directory with `mktemp -d`, writes the generated
corpus and each language's raw normalized output there, and retains runner logs,
`summary.json`, and full `mismatches.json` reproductions. It writes no tracked
files, performs no Git operations, and applies **no skips**. Each runner has a
10-minute timeout. Exit status is nonzero on a runner failure or any discrepancy
against the specification. Dependencies must be installed first; ordinary build
artifacts may be updated under the language build directories.

Summary counts are per case. `crossLanguage` compares all three normalized sets;
`versusSpec` compares each language with the independent oracle. Categories count
each differing error code once per case; `OK_FAIL` additionally counts acceptance
differences. Category totals can exceed the number of differing cases.

## Neutral JSON format (version 1)

The corpus is a JSON array. Each case has the following required fields:

| Field | Meaning |
| --- | --- |
| `id` | Unique stable string, `seed-SEED-INDEX` for generated cases. |
| `family` | Descriptive generator coverage label; not passed to builders. |
| `states` | Exactly eight entries in order `S0` through `S7`, each with `name`, `initial` and `terminal` booleans. Zero or one initial state. |
| `transitions` | Ordered list of Auto, External or Branch declarations (below). |
| `onError` | Array of `{ "from": "S0", "to": "S1" }`, at most one per source. |
| `onStepError` | Same shape, at most one per source in generated cases. Each registers a broad exception route through the public builder API. |
| `initiallyAvailable` | Set of type names available at the initial state. |
| `externallyProvided` | Set of type names added before each successful External guard evaluation. |
| `allowPerpetual` | Skip the path-from-initial-to-a-terminal check when true. |
| `allowUnreachable` | Skip the non-terminal reachability check when true. |

The fixed type pool is `T0` through `T7`; the generator currently samples six
(`T0` through `T5`). Sets are arrays with no duplicates. Every referenced state
must exist. The generator varies two through eight active states; the remaining
pool states are isolated terminal padding. Padding cannot create a path to a
terminal and does not suppress checks on unreachable non-terminal active states.

A contract is `{ "requires": ["T0"], "produces": ["T1"] }`.

```json
[
  { "kind": "auto", "from": "S0", "to": "S1",
    "processor": { "requires": [], "produces": ["T0"] } },
  { "kind": "external", "from": "S1", "to": "S2",
    "guard": { "requires": ["T0"], "produces": ["T1"] },
    "processor": { "requires": ["T1"], "produces": [] } },
  { "kind": "branch", "from": "S2", "branch": { "requires": ["T1"] },
    "targets": [ { "label": "yes", "to": "S3" }, { "label": "no", "to": "S4" } ] }
]
```

Auto requires a processor. External requires a guard and has an optional
processor. Branch requires a nonempty target list with distinct labels. Branch
callbacks have `requires` only: **none of the three APIs exposes branch
`produces`**. Rust's BranchBuilder additionally lacks Java/TypeScript's
per-target processor API, so target processors are outside this common format;
production after a branch is expressed by an ordinary downstream Auto step.
SubFlow, explicit external triggers, unknown state references, duplicate branch
labels, and multiple initial states are outside version 1. No dropped callback
or fabricated transition is used to emulate an unavailable API.

The generator combines unconstrained small graphs with guaranteed templates for
joins in both declaration orders, onError/onStepError joins, states reached only
by onStepError, branch failure, guard exhaustion, guard rollback after processor
failure, and valid chains. Random graphs cover cycles, joins, unreachable states,
terminal outgoing edges, Auto/External conflicts, ambiguous guard requirements,
missing initial states, declarations of initial/external types, and both flags.

## Specification evaluator

The rules follow the [paper](../../docs/paper-tramli-constrained-flow-engine.md)
sections 3.4 and 3.5, with the clarified error semantics in
[issue 157](https://github.com/opaopa6969/tramli/issues/157):

1. Without an initial state, report `NO_INITIAL_STATE`. Still run all independent
   structural checks. Reachability, path-to-terminal and dataflow need an initial
   state and do not run without one.
2. Reachability and path-to-terminal traverse ordinary transitions and all
   onError/onStepError routes. Reachability requires every non-terminal state to
   be reachable. The terminal-path check concerns the initial state only.
3. Auto/Branch edges must form a DAG; External and error edges are excluded from
   this check. A state may not have both Auto/Branch and External transitions.
   Terminal states may not have ordinary outgoing transitions. Legacy external
   guards at the same state must have distinct `requires` sets.
4. Start with `initiallyAvailable`. At joins, intersect the available sets over
   **all** incoming paths, including revisits carrying a strictly smaller set.
   The finite-set worklist converges before requirements are evaluated. External
   data is added before the guard; guard produces precede processor requires;
   processor produces flow to the normal successor. Missing requirements do not
   halt analysis of the remaining definition.
5. For every **non-terminal** state with at least one outgoing transition, each
   error target receives exactly the guaranteed set at that state. No guard
   produces, processor produces, or newly externally provided data is added.
   This covers branch failure, guard retry exhaustion and processor rollback.
   Error routes at terminal states or states without outgoing transitions do not
   introduce dataflow paths. This intentionally distinguishes structural graph
   reachability from executable failure-transfer reachability.

## Normalized verdicts

Each expected verdict is `{ "ok": boolean, "errors": [[code, locus], ...] }`.
Pairs are deduplicated and sorted lexicographically by code and then locus.
`ok` is true exactly when the set is empty. Diagnostic insertion order, language
wording and duplicate occurrences do not affect comparison.

| Code | Finest shared locus |
| --- | --- |
| `NO_INITIAL_STATE`, `DAG_CYCLE` | `flow` |
| `UNREACHABLE_STATE`, `NO_PATH_TO_TERMINAL` | `S0` (the affected state) |
| `AUTO_EXTERNAL_CONFLICT`, `EXTERNAL_REQUIRES_NOT_DISTINCT` | `S0` |
| `TERMINAL_OUTGOING` | `S0->S1` |
| `MISSING_REQUIRES` (guard/branch) | `guard:e0@S0` or `branch:e0@S0` |
| `MISSING_REQUIRES` (processor) | `processor:e0@S0->S1` |

`e0` is the declaration's zero-based index; assigning unique component names
preserves distinct guards/processors even when they share endpoints. Branch
requirements belong to the single branch component, not each label. The loaders
use diagnostic messages when structured fields lack this information. Unknown
diagnostics fail the harness instead of silently discarding information.

Explicit normalization and unavoidable limits:

- Rust `REQUIRES_PRODUCES` maps to `MISSING_REQUIRES`. This is a documented API
  naming difference, not an additional bug issue. Rust diagnostics omit missing
  type names, so the shared locus cannot distinguish individual missing types.
- Rust `TERMINAL_HAS_OUTGOING` maps to `TERMINAL_OUTGOING`; the message retains
  both endpoints even where a structured error exposes only the source state.
- TypeScript currently reports missing initial state as generic `VALIDATION`;
  its specific message maps to `NO_INITIAL_STATE`.
- A DAG diagnostic names a traversal-dependent state, not a canonical cycle.
  Therefore only the flow locus is comparable, not the selected vertex.
- Guard/branch/processor identity can be recovered from all three messages, so
  it is retained rather than reducing all missing requirements to a state.

Java uses an eight-state enum and fixed marker classes. Initial/terminal flags
come from a thread-local case config; `@Execution(SAME_THREAD)` keeps this test
class serial, and each case clears its config. Rust uses the same pools with
thread-local flags and one serial integration-test loop. Neither loader shares
mutable state configuration with another test class or integration test binary.

## Known mismatches

`expected.json` has this additional registry (example only):

```json
{
  "knownMismatches": {
    "152": { "languages": ["java", "ts", "rust"], "cases": ["seed-153-00010"] },
    "155": { "languages": ["java", "ts", "rust"], "cases": ["seed-153-00010"] }
  }
}
```

The verdict itself remains specification-correct even when a comparison is
skipped. A case can reference multiple issues; a language skips it while **any**
applicable entry remains. Removing one issue key re-enables its cases only when
no other issue still applies. Java reports assumption skips, TypeScript reports
skipped tests, and Rust reports each skipped case plus totals on captured test
output (`cargo test --test build_verdicts -- --nocapture` to display it).
Fuzz mode always evaluates these cases, so agreement after a fix is observable.

The corpus was first committed while three shared checker bugs and one Rust
diagnostics bug were still open. All are fixed on main and have no skip entries:
[#152](https://github.com/opaopa6969/tramli/issues/152) (exception routes were not traversed),
[#155](https://github.com/opaopa6969/tramli/issues/155) (a narrower set at a revisited join was ignored),
[#157](https://github.com/opaopa6969/tramli/issues/157) (error-path transfer did not match runtime rollback), and
[#158](https://github.com/opaopa6969/tramli/issues/158) (Rust dropped independent diagnostics without an initial state).
With those fixes, `node shared-tests/build-verdicts/fuzz.mjs 153 10000` reports no
discrepancy in any language. Add a new entry only for an independently reported
mismatch with its own issue reference; do not weaken the oracle.
