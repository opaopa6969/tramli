---
status: accepted
---

# DD-020: Multi-External Transitions + Entry/Exit Actions

**Date:** 2026-04-09
**Sessions:**
- [R2: multi-external](../sessions/dge-session-r2-multi-external.md)
- [R3: requires-routing](../sessions/dge-session-r3-requires-routing.md)
- [R4: self-transition](../sessions/dge-session-r4-self-transition.md)
- [external-review](../sessions/dge-session-external-review.md)

## Decision

### 1. Multi-External: Multiple external transitions from a single state

A single state can have multiple external transitions. Guard selection is by **requires type matching** — the guard whose requires() types are all present in the external data gets evaluated.

```java
.from(ACTIVE)
    .external(ACTIVE, profileUpdateGuard)     // requires: ProfileUpdate
    .external(SUSPENDED, suspendGuard)        // requires: SuspendRequest
    .external(DEACTIVATED, deactivateGuard)   // requires: DeactivateRequest
```

- No new API types needed (no event names, no TransitionHint)
- `resumeAndExecute(flowId, def, externalData)` — engine selects guard by checking which guard's requires() are all satisfied by externalData types
- guard_failure_count keyed by **guard name** (not target state) to support self-transitions
- Rejected external data is rolled back (only newly-inserted keys removed)

### 2. Entry/Exit actions (pure state markers only)

Entry/exit callbacks on states, but **no I/O** — sync core principle.

```java
.onStateEnter(ACTIVE, ctx -> ctx.put(ActivatedAt.class, Instant.now()))
.onStateExit(ACTIVE, ctx -> metrics.increment("active_sessions", -1))
```

- Pure data/metrics operations only
- Not processors (no requires/produces)
- Run synchronously during transition_to()

### 3. Self-transitions

```java
.from(ACTIVE).external(ACTIVE, profileUpdateGuard)  // ACTIVE → ACTIVE
```

- guard_failure_count cleared only on **actual state change** (not self-transition)
- entry/exit actions fire on self-transitions (enter new "instance" of same state)

## Supersedes

- DD-004 check #4 (at most 1 External per state) — relaxed to allow multiple

## Rationale

- User lifecycle flows (ACTIVE state with profile update, suspend, deactivate) require multiple externals from one state
- requires-based routing is zero new API surface — works with existing resumeAndExecute
- Entry/exit actions address external review Gap "record debt" — timestamps and metrics tracked automatically
- Self-transitions are common in long-lived flows (profile updates don't change state)

## NOT-DOING

- Event names / event enum — breaks API
- TransitionHint — unnecessary with requires-based routing
- Entry/exit with I/O — contradicts sync core (DD-012, DD-013)
- Further SubFlow feature expansion — stop at current level (external review recommendation)
