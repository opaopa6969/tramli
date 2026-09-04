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
- [2026 trigger review](../sessions/2026-09-04-external-trigger-routing.md)

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

- Separate event-name argument on `resumeAndExecute` — breaks every caller
- Untyped string event enum — typo-prone; reuse the existing typed key system instead
- Entry/exit with I/O — contradicts sync core (DD-012, DD-013)
- Further SubFlow feature expansion — stop at current level (external review recommendation)

## Amendment: explicit External trigger (2026-09-04)

Issue #91 の実利用により、「requires-based routing は新APIを増やさないので単純」という前提が崩れた。`requires` は guard のデータ依存とイベント識別を兼務し、データを必要としないイベントを `requires: []` で表現できなかった。また、subset の同時一致が宣言順に依存し、不一致時に先頭 guard へ fallback する実装も確認された。

以下で Decision 1 を改訂する。

- 新規 Multi-External は、既存の型付きキーを使う `externalOn(triggerKey, to, guard)` / `external_on::<T>(to, guard)` を推奨する。
- `resumeAndExecute` のシグネチャは変更しない。trigger key は既存の externalData に含める。
- `requires` は guard が読むデータだけを宣言する。
- trigger metadata は `TransitionGuard` の後方互換な default / optional hook に保持し、`externalOn` が内部 wrapper を作る。public `Transition` の形は変えない。
- 同一 state で明示 trigger routing と legacy requires routing を混在させない。
- legacy Multi-External は最長一致とし、同率・不一致を明示エラーにする。宣言順 fallback は行わない。
- `waitingFor` は先頭遷移ではなく全 External の trigger / requires の和集合を返す。

既存 `.external()` は後方互換のため維持する。新しい文字列イベント型や `resumeAndExecute` の追加引数は導入しないため、以前の NOT-DOING の目的である呼び出し側互換性は保たれる。詳細は [TECH-012](../specs/TECH-012-external-trigger-routing.md) を参照。
