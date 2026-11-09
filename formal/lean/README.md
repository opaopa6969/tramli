# Requires/produces soundness in Lean 4

This Lake project proves soundness of the **intended, corrected abstract
requires/produces algorithm** for [issue #154](https://github.com/opaopa6969/tramli/issues/154).
It is not a verification of the Java, TypeScript, or Rust source code. The
divergences found while formalizing it against revision `d1504aa1` (listed
below) have since been fixed in all three implementations. The link between
this model and the code is checked empirically, not proved: the differential
corpus in [`shared-tests/build-verdicts/`](../../shared-tests/build-verdicts/README.md)
compares all three implementations with an independent oracle that computes
the same intersection fixpoint.

## Build and trust boundary

```sh
cd formal/lean
lake build
lake env lean Tramli/Checks.lean
```

The toolchain is pinned to `leanprover/lean4:v4.33.1`. Only Lean's bundled core,
Std, and Lean metaprogramming API are used; there is no Mathlib, Batteries, or
other package dependency. A newer stable toolchain download failed in the
implementation environment, so this recent, already installed stable version
was used. `lake-manifest.json` records an empty dependency list.

The default Lake target imports all proofs, executable examples, and the
axiom audit. `Checks.lean` prints the main theorems' dependencies and rejects
any declaration in the `Tramli` namespace whose transitive axiom dependencies
are outside `propext`, `Classical.choice`, and `Quot.sound`. It audits the
termination proofs and examples as well. The examples use `decide +kernel`,
not native evaluation. There are no proof placeholders or custom axioms.

Current output:

```text
'Tramli.local_invariant_soundness' does not depend on any axioms
'Tramli.stabilize_fixed' depends on axioms: [propext, Quot.sound]
'Tramli.algorithm_success_implies_invariant' depends on axioms: [propext, Quot.sound]
'Tramli.algorithm_soundness' depends on axioms: [propext, Quot.sound]
```

## The theorem

[`Tramli.algorithm_soundness`](Tramli/Algorithm.lean) states: if `check m`
returns `some a`, then at every finite execution trace prefix, every possible
next guard, branch decision, and processor has all of its declared required
keys at the stage when it executes. A guard sees the source context plus
External input; a branch and processor also see accepted guard output. The
claim covers every path, including paths through either kind of error route
and prefixes of cyclic executions.

The proof has two independent layers:

1. [`local_invariant_soundness`](Tramli/Model.lean): a `LocalInvariant` assigns
   a reachable predicate and a guarantee set `A(s)` to states. The initial
   state is reachable, `A(initial)` is contained in `initiallyAvailable`,
   reached edges preserve reachability and satisfy
   `A(target) ⊆ transfer(edge, A(source))`, and each reachable normal edge's
   contracts hold at their respective stages. `trace_invariant` proves by
   induction that `A(s)` is contained in the context after every trace prefix;
   monotonicity then proves the requirements.
2. [`algorithm_success_implies_invariant`](Tramli/Algorithm.lean): the
   terminating intersection computation supplies the initial and edge
   conditions. The final requirement check supplies the contracts. The checker
   does **not** test the invariant or assume soundness as an extra success
   condition. `stabilize_fixed` proves its result is a fixpoint.

`Trace` deliberately does not require contracts to hold as a premise of a
step. Its premises express data-production and preservation assumptions,
not the desired conclusion. Consequently the theorem does not obtain
soundness by excluding executions with unmet requirements.

## Execution and failure model

States and keys are `Fin n` and `Fin k`; contexts are predicates on keys.
`Transition` records Auto, External, and Branch contracts. Each branch label
is normalized into its own transition. `Flow.edges` includes those normal
transitions and automatically generates a state-level edge for **each**
`onError` and `onStepError` route whose source is non-terminal and has at
least one outgoing transition. `error_route_present` proves that generation
does not drop such a route. Error edges do not depend on processor presence.

For a source context `C`, the normal transfer is:

```text
before guard = C union (externallyProvided if External, otherwise empty)
after guard  = before guard union guard.produces
normal post  = after guard union processor.produces
error post   = C
```

`error_transfer` proves the last equality for both error kinds. No guard,
processor, or External additions are credited on an error edge. This is the
failure model requested in #157, covering a throwing processor, a throwing
branch decision, and guard retry exhaustion. Exception-type matching and
route priority are overapproximated: every declared error target is possible.
This can reject infeasible paths, which is acceptable for soundness.

`transfer` computes the exact **guaranteed** set. `Trace.step` also permits
an actual post-context to be a superset of it. For example, external input
may survive rollback, but no downstream requirement can rely on that input
via the error edge. Taking the post-context equal to `transfer` gives the
minimal execution semantics; allowing extra keys proves a stronger result.
The guard/branch/processor attempted before failure has its contracts checked
through its normal outgoing transition; error routing itself invokes no
such component and has no additional requirements.

## Intersection algorithm and termination

`Facts` is a finite list encoding the state map. `(s, none)` means unreached;
`(s, some key)` means a candidate guarantee. These are distinct: reaching a
state with no available keys is different from not reaching it. `top` starts
with every marker and key; `top_length` proves its size is `n * (k + 1)`.

`sweep` intersects existing candidates with the initial boundary and with
all reached incoming contributions. An incoming error contribution is the
source set unchanged. A reached incoming edge removes the destination's
unreached marker. `sweep_available_iff` states the intersection equation.
`intersection_unchanged_iff` proves the correct revisit rule:

```text
existing intersection incoming = existing  iff  existing is a subset of incoming
```

A narrower incoming set therefore shrinks the old guarantee and causes
another pass. This corrects #155; both exception route kinds correct #152;
state-level failure transfer corrects #157.

The scheduling abstraction is an explicit **full sweep**, rather than the
implementations' recursive DFS/worklist order. Every change re-evaluates all
edges on the next pass, including all downstream edges. The same intersection
and transfer equations are used; this project does not prove instruction-level
or traversal-order equivalence with a particular implementation. Requirements
are checked once after convergence, instead of accumulating diagnostics during
traversal. The model returns success/failure and the assignment, not diagnostic
text.

`stabilize` is a total well-founded recursive definition with measure
`a.length`. Each recursive call strictly shortens the list. If it cannot
shorten, `sweep_eq_of_not_shorter` proves that filtering changed nothing.
Thus there is no fuel exhaustion result, no termination assumption, and no
acyclicity assumption. There can be at most `n * (k + 1)` changing passes
from `top`, followed by the final stable pass. The implementation's runtime
limits on automatic chain length are outside this safety theorem.

## Assumptions and exclusions

- The finite state/key universe and normalized declarations accurately
  represent the flow, including every branch target and every error route.
  Distinct data types/keys have distinct identifiers. This extraction is a
  correspondence obligation, not proved by Lean. Other structural `build()`
  checks, such as a unique initial state and no outgoing terminal transitions,
  are outside this data-flow checker.
- SubFlow is excluded. There is no nesting, shared subflow context, or exit
  mapping in this model.
- The actual initial context contains `initiallyAvailable`. Every attempted
  External transition receives the declared `externallyProvided` keys before
  evaluating its guard. Callers and persistence layers must honor these
  contracts; declaring a key alone does not create it at runtime.
- Accepted guards supply every declared produced key. Every normal-transition
  processor actually executes and, on success, puts every declared produced
  key. Branch decisions and successful components preserve existing valid
  keys. Type availability means a usable value, not a null or invalid value
  stored under the key. Extra keys and replacement by valid values are allowed.
- On failure, at least the source state's valid keys survive rollback. The
  guaranteed error set is exactly the source set; guard and processor output
  is discarded from the analysis even if an implementation retains extra data.
- Guard rejection and retry before exhaustion do not remove or invalidate
  context keys and do not change state. They can be erased from traces;
  exhaustion is represented by an error edge. Expiration or an unhandled
  exception stops the trace. There is no liveness or retry-limit theorem.
- Hooks (`onEnter`/`onExit`), observers, loggers, storage, and concurrent code
  do not remove/invalidate keys or create unmodeled control transfers. In
  particular, exceptions after a state change from these callbacks are
  excluded. Branch/processor failures and retry exhaustion are included.
- The theorem is about this abstract algorithm. Runtime code, serialization,
  callback implementations, and correspondence to the model are not certified.
  Soundness for the library binaries additionally relies on the implementations
  matching this model (checked by the differential corpus, not proved) and on
  the assumptions above.

## Correspondence to the implementations

Locations refer to baseline `d1504aa1`; function names are included so the table
remains useful as separate fixes move lines. Java definition/engine paths are
under `lang/java/src/main/java/org/unlaxer/tramli/`; TS paths are under
`lang/ts/src/`; Rust paths are under `lang/rust/src/`.

| Lean definition / theorem | Java | TypeScript | Rust |
| --- | --- | --- | --- |
| `Transition`, `Kind`, normal part of `Flow.edges` | `Transition.java`; `FlowDefinition.java:BranchBuilder.endBranch` | `flow-definition.ts:BranchBuilder.endBranch` and transition records | `definition.rs:BranchBuilder.end_branch` and transition records |
| `Flow.initiallyAvailable`, initial boundary in `Allowed` | `FlowDefinition.java:checkRequiresProduces` (703) | `flow-definition.ts:checkRequiresProduces` (486) | `definition.rs:check_requires_produces` (1293) |
| `beforeGuard`, `afterGuard`, `Requirements`, normal `transfer` | `FlowDefinition.java:checkRequiresProducesFrom` (725-752) | `flow-definition.ts:checkRequiresProducesFrom` (514-540) | `definition.rs:check_rp_from` (1333-1377) |
| `Facts`, `available`, `sweep`, `intersection_unchanged_iff` | `stateAvailable`, `retainAll` in `checkRequiresProducesFrom` | `stateAvailable`, deletion-based intersection in `checkRequiresProducesFrom` | `state_available`, `intersection` in `check_rp_from` |
| `stabilize`, `stabilize_fixed` | recursive re-evaluation in `checkRequiresProducesFrom` | recursive re-evaluation in `checkRequiresProducesFrom` | recursive re-evaluation in `check_rp_from` |
| `Flow.errors`, `Flow.edges`, `error_route_present` | `errorTransitions`, `exceptionRoutes`; `FlowEngine.java:handleError` (489) | `errorTransitions`, `exceptionRoutes`; `flow-engine.ts:handleError` (458) | `error_transitions`, `exception_routes`; `engine.rs:handle_error_with_cause` (751) |
| `Trace`, `transfer`, `error_transfer` | `FlowEngine.java:startFlow`, `resumeAndExecute`, `dispatchStep`, `dispatchBranch` | `flow-engine.ts:startFlow`, `resumeAndExecute`, `executeAutoChain` | `engine.rs:start_flow`, `resume_and_execute`, `dispatch_step` |
| `local_invariant_soundness`, `algorithm_success_implies_invariant`, `algorithm_soundness` | abstract proof obligation for `build()` | abstract proof obligation for `build()` | abstract proof obligation for `build()` |
| **Fixed divergence #152** (PR #167): model includes every `onStepError` edge | checker omits `exceptionRoutes` | checker omits `exceptionRoutes` | checker omits `exception_routes` |
| **Fixed divergence #155** (PR #156): stop only if `existing ⊆ incoming` | inverted `existing.containsAll(available)` | inverted `isSubset` test | inverted `available.is_subset(existing)` |
| **Fixed divergence #157** (PR #168): errors from any active non-terminal source propagate only its set | processor-only analysis credits guard output; External runtime restores pre-guard backup | same checker limitation; External backup precedes accepted data insertion | same checker limitation; External backup precedes accepted data insertion |
| **Fixed divergence #159** (PR #166): declared normal processors must execute | null-guard External processor is skipped at runtime while its output is credited by the checker | no-guard runtime branch also skips processors; normal typed builder requires a guard | no-guard runtime branch also skips processors; normal typed builder requires a guard |

Issue links: [#152](https://github.com/opaopa6969/tramli/issues/152),
[#155](https://github.com/opaopa6969/tramli/issues/155),
[#157](https://github.com/opaopa6969/tramli/issues/157),
[#159](https://github.com/opaopa6969/tramli/issues/159).
The standalone Java reproduction in #159 was run at the baseline: build
succeeded, the producer was never called, and execution reported
`Required context missing: P`. The language columns describe the behavior at
`d1504aa1`, before the fixes. With all four fixes on main, fuzzing 10,000
generated flows (`node shared-tests/build-verdicts/fuzz.mjs 153 10000`)
reports no discrepancy between any implementation and the oracle. This
directory changes no library code.

## Kernel-checked examples

[`Examples.lean`](Tramli/Examples.lean) checks a plain diamond join in both
edge orders, processor-free Branch failures through both error route kinds,
guard retry exhaustion, External/guard/processor stage ordering, exclusion
of all three kinds of newly supplied data on error paths, initial data
surviving errors, cycles with increasing input sets, missing initial data
on cycles, unreachable-state handling, and error-route generation boundaries.
These examples complement the universally quantified proofs; they do not
replace them. Differential implementation tests live in
[`shared-tests/build-verdicts/`](../../shared-tests/build-verdicts/README.md) (#153).
