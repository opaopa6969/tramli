---
status: accepted
---

# DD-021: Flat Enum is the Correct Design Choice (Carta/Tenure Validation)

**Date:** 2026-04-09
**Sessions:**
- [Harel Carta](../sessions/dge-session-harel-carta.md)
- [Carta DataFlow](../sessions/dge-session-carta-dataflow.md)
- [Helland Tenure](../sessions/dge-session-helland-tenure.md)

## Decision

tramli's flat enum state model is **not a limitation but the correct design choice** for data-flow verification. This is validated by two independent designs:

### Carta (Harel Statecharts)

Harel designed "Carta" with hierarchical states, entry/exit actions, and visual formalism. When data-flow verification was applied:

- **Flat enums**: perfect verification (every path enumerable)
- **Hierarchical states**: verification degrades (super-state transitions create implicit paths)
- **Orthogonal regions**: verification breaks (concurrent states create exponential path combinations)

**Discovery: direct orthogonal regions cannot coexist with data-flow verification.**

### Tenure (Helland Event Sourcing)

Helland designed "Tenure" with event sourcing, immutable logs, and compensation. When data-flow verification was applied:

- Same requires/produces logic applies to event `apply()` instead of processor `produce()`
- Event log verification is equivalent to context-based verification

**Discovery: data-flow verification is state-management-paradigm-agnostic.** It works equally on:
- Mutable context (tramli)
- Event logs (Tenure/event sourcing)
- Statecharts (Carta, with limitations)

## Implication

- tramli does **not** need to adopt hierarchical states to be "complete"
- The flat model is the **maximum expressiveness** that preserves complete data-flow verification
- This should be documented as a conscious design choice, not a TODO

## Rationale

Both Harel (Statechart inventor) and Helland (distributed systems pioneer) independently arrived at the same conclusion: designing for simplicity from either direction converges on tramli's flat + data-flow approach.
