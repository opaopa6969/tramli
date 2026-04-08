# tramli plugin pack handoff

## Goal

Integrate the current Java plugin pack direction into the **tramli Java** codebase without weakening tramli’s core guarantees.

The core principle is:

> **Do not change tramli core semantics.**
>
> tramli remains a **verification kernel**: flat semantics, `requires/produces`, and build-time data-flow validation stay intact.

---

## What must not be broken

### Non-negotiable invariants

- Keep **tramli core flat**.
- Do **not** weaken `requires/produces` build-time verification.
- Do **not** override validator meaning with plugins.
- Do **not** introduce runtime hierarchical semantics into core.
- Do **not** introduce orthogonal regions.
- Do **not** move full event sourcing into core.
- Do **not** make compensation a core state machine responsibility.

In short:

- **tramli core** = verification kernel
- everything else = plugin / adapter / generator / decorator

---

## Architectural direction

We are **not** merging Carta and Tenure into tramli core.
We are using tramli as the kernel and absorbing useful ideas through plugins.

### Design slogan

> **Write like Carta, verify like tramli, run with Tenure-lite.**

### Layering model

- **Carta-style authoring** → generator / front-end plugin
- **tramli** → normalized flat graph + verification kernel
- **Tenure-lite runtime** → decorator / adapter plugins for durability features

---

## Current artifact to start from

Primary artifact:

- `tramli-plugin-pack-java-v1_1.zip`

Older artifacts for reference only:

- `tramli-plugin-pack-java-revised.zip`
- `tramli-plugin-pack-java.zip`

---

## Agreed design decisions

## 1. Plugin API direction

Use a unified plugin model centered around `FlowPlugin` and `PluginKind`.

### Core plugin types

- `FlowPlugin`
- `PluginKind`
- `AnalysisPlugin`
- `StorePlugin`
- `EnginePlugin`
- `RuntimeAdapterPlugin<R>`
- `GenerationPlugin`
- `DocumentationPlugin`
- `PluginRegistry`

### Expected lifecycle

- store decorators are applied through registry-managed wrapping
- engine plugins are installed centrally
- analysis plugins are executed via bulk analysis
- runtime adapters are bound explicitly
- generation plugins are invoked as front-end tooling

Goal:

> plugin pack should behave like a **real extension framework**, not a loose collection of helpers.

---

## 2. Hierarchy handling

Hierarchy is allowed only as an **authoring convenience**, not as core runtime semantics.

### Rules

- `HierarchicalStateSpec` must explicitly carry:
  - `initial`
  - `terminal`
- No terminal inference from naming conventions.
- Hierarchy must compile or generate into:
  - flat enum states
  - flat builder skeletons
  - synthetic entry/exit transitions if needed
- Orthogonal regions remain out of scope.

### Important constraint

Do not let hierarchy leak into validator semantics.

The correct model is:

- author hierarchically
- normalize to flat tramli graph
- validate in flat form

---

## 3. Tenure-lite eventstore direction

The eventstore plugin is **not full Tenure**.
It is intentionally a lighter runtime layer.

### Included concepts

- append-only transition log
- produced-data-oriented durability hooks
- replay support
- `stateAtVersion(...)`
- compensation recording

### Important current assumption

`ReplayService.stateAtVersion(...)` currently assumes:

> each `TRANSITION` event contains a **full snapshot** of relevant state/data.

If the implementation later moves to diff-only persistence, then replay must become a real fold/reducer pipeline.

This assumption should remain clearly documented in Javadoc and docs until changed intentionally.

### Related types

- `EventLogStoreDecorator`
- `VersionedTransitionEvent`
- `ReplayService`
- `CompensationResolver`
- `CompensationService`
- projection-related utilities

---

## What plugins are in scope for v1

Keep v1 focused.

Recommended v1 plugin set:

- **audit**
- **hierarchy generation**
- **rich resume**
- **eventstore-lite**
- **lint / policy analysis**

These are enough to prove the platform without bloating scope.

---

## What plugins are explicitly out of scope for now

Do **not** implement these as part of v1:

- orthogonal regions support
- validator semantics override plugins
- full event sourcing runtime replacement
- full Tenure parity
- compensation in core engine semantics

---

## Concrete tasks for the coding agent

## P1. Align plugin pack with real tramli Java APIs

- inspect tramli Java codebase
- replace placeholder integration seams with real ones
- adapt package names, type names, and call sites
- define minimal official SPI points for:
  - store wrapping
  - engine installation
  - runtime adapter binding
  - analysis execution
  - generation tooling

Success condition:

> plugin pack integrates naturally with tramli Java rather than sitting beside it as a parallel prototype.

---

## P2. Preserve validator semantics

Add regression coverage to prove that plugin support does **not** change tramli verification semantics.

Required idea:

- same flow definition without plugins and with plugins must produce identical validation meaning unless a plugin only adds analysis/generation/runtime decoration

This is critical.

---

## P3. Tighten v1 plugin implementations

### Audit plugin

- keep produced-data capture lightweight
- make output stable and serializable
- integrate cleanly with aliases / readable names if available

### Rich resume plugin

- make result classification explicit and testable
- distinguish clearly between:
  - transitioned
  - already complete
  - no applicable transition
  - rejected
  - exception-routed if applicable

### Hierarchy generation plugin

- rely only on explicit spec flags
- avoid naming heuristics
- keep generated output readable and deterministic

### Eventstore-lite plugin

- preserve documented full-snapshot assumption for now
- make compensation logging explicit
- provide replay / version lookup tests

### Lint plugin

Start with policy checks that reinforce tramli quality, for example:

- terminal states should not have outgoing transitions
- suspiciously large produces sets
- subflow depth constraints if relevant
- naming / structure conventions if desired

---

## P4. Add tests

Minimum test set:

- plugin registry lifecycle test
- store plugin wrapping test
- engine plugin installation test
- runtime adapter binding test
- hierarchy generation test
- eventstore replay test
- `stateAtVersion(...)` behavior test
- compensation logging test
- rich resume classification test
- regression test proving validator semantics are unchanged

---

## P5. Improve docs

Add documentation aimed at plugin authors and adopters.

Recommended docs:

- plugin lifecycle overview
- what plugins may and may not do
- hierarchy authoring constraints
- Tenure-lite vs full Tenure explanation
- replay model and full-snapshot assumption
- examples for each v1 plugin

---

## Reviewer-confirmed points already handled

These points were reviewed positively and should be preserved:

1. **Hierarchy terminal hardcoding removed**
   - terminal / initial are explicit in spec
2. **Plugin API unified**
   - plugins participate through a coherent typed lifecycle
3. **Eventstore gained compensation + `stateAtVersion(...)`**
   - Tenure-lite direction is now visible
4. **Replay assumption documented**
   - full-snapshot assumption is explicit
5. **Runtime adapter lifecycle separated properly**
   - avoid accidental skipping in registry handling

---

## The most important message for implementation

If trade-offs appear, prefer this order:

1. preserve tramli verification kernel
2. keep plugin boundaries clean
3. reduce v1 scope if needed
4. delay richer runtime features rather than leaking them into core

In one sentence:

> **tramli should become a plugin platform around a frozen verification kernel, not a larger monolithic workflow framework.**

---

## Short prompt version for the coding agent

```text
Integrate the Java plugin pack into tramli Java without changing tramli core semantics.

Rules:
- Keep flat core semantics.
- Do not weaken requires/produces build-time verification.
- Do not introduce orthogonal regions.
- Do not move full event sourcing into core.
- Treat hierarchy as authoring-only and compile/generate it into flat tramli structures.
- Treat eventstore as Tenure-lite runtime decoration, not full Tenure.

Start from tramli-plugin-pack-java-v1_1.zip.
Focus v1 on:
- audit
- hierarchy generation
- rich resume
- eventstore-lite
- lint

Main goals:
- align the plugin pack with real tramli Java APIs
- add official plugin SPI / integration points
- add regression tests proving validator semantics are unchanged
- keep plugin lifecycle unified and documented
```

