# FlowDefinition Specification

この仕様は、`FlowDefinition` で状態・遷移・エラー経路を宣言する方法と、`build()` が行う検証を決めます。
Java・TypeScript・Rust の実装者と、フロー定義の検証条件を確認する利用者向けです。
利用目的は README の[「なぜ tramli が必要か」](../../README-ja.md#なぜ-tramli-が必要か)、全体像は[「FlowDefinition」](../../README-ja.md#flowdefinition)を参照してください。

**読み方**: Builder API で定義方法を確認し、build() Process → Validation Checks → Warnings で実行前の検証を読み、Accessor Methods と withPlugin で構築後の操作を確認します。

**用語**: 初期状態（initial state）は開始地点、終端状態（terminal state）は終了地点、Processor は遷移に伴う処理、Guard は外部イベントを検証する処理です。
Auto は自動遷移、External は外部イベントによる遷移、Branch は返されたラベルで行き先を選ぶ遷移、SubFlow は親フローに組み込む子フローを指します。
`requires` は処理に必要なデータの宣言、`produces` は処理が提供するデータの宣言、`DataFlowGraph` はその依存関係を表すグラフです。
TTL（time-to-live）はフローインスタンスの有効期間、DAG（directed acyclic graph）は有向の循環を含まないグラフ、perpetual は終端への到達を必須としないフローを指します。

**Source**: Java reference implementation (v3.1.0)

## Builder API

### Configuration Methods

| Method | Default | Description |
|--------|---------|-------------|
| ttl(Duration) | 5 min | Flow instance time-to-live |
| maxGuardRetries(int) | 3 | Max guard rejections before error |
| initiallyAvailable(types...) | empty | Types provided via startFlow(initialData) |
| allowPerpetual() | false | Skip path-to-terminal validation |

### Transition Methods

| Method | Creates |
|--------|---------|
| from(S).auto(to, processor) | AUTO transition |
| from(S).external(to, guard) | EXTERNAL transition |
| from(S).external(to, guard, processor) | EXTERNAL with post-guard processor |
| from(S).external(to, guard, timeout) | EXTERNAL with per-state timeout |
| from(S).external(to, guard, processor, timeout) | EXTERNAL with processor + timeout |
| from(S).externalOn(trigger, to, guard, ...) | EXTERNAL selected by typed trigger; same processor/timeout variants |
| from(S).branch(branchProcessor).to(S, label).to(S, label, proc).endBranch() | BRANCH transitions |
| from(S).subFlow(def).onExit(terminal, parentState).endSubFlow() | SUB_FLOW transition |

### Error Routing

| Method | Description |
|--------|-------------|
| onError(from, to) | State-based error fallback |
| onAnyError(errorState) | Set error target for all non-terminal states |
| onStepError(from, exceptionType, to) | Exception-typed routing (checked before onError) |

### Enter/Exit Actions

| Method | Description |
|--------|-------------|
| onStateEnter(state, action) | Callback after entering state (pure data/metrics) |
| onStateExit(state, action) | Callback before leaving state (pure data/metrics) |

## build() Process

1. Compute initialState (from FlowState.isInitial)
2. Compute terminalStates (from FlowState.isTerminal)
3. Run validation
4. Build DataFlowGraph
5. Build warnings
6. Return immutable FlowDefinition

## Validation Checks

| # | Check | Error Message |
|---|-------|---------------|
| 1 | Initial state exists | "No initial state found" |
| 2 | Reachability | "State X is not reachable from Y" |
| 3 | Path to terminal (skipped if perpetual) | "No path from X to any terminal state" |
| 4 | DAG (auto/branch only) | "Auto/Branch transitions contain a cycle" |
| 4a | Multi-External routing mode and uniqueness | `EXTERNAL_ROUTING_MIXED`, `EXTERNAL_TRIGGER_NOT_DISTINCT`, or `EXTERNAL_REQUIRES_NOT_DISTINCT` |
| 5 | Branch completeness | "Branch target 'label' -> X is not a valid state" |
| 6 | Requires/produces | "Guard/Processor/Branch 'X' requires Y but not available" |
| 7 | Auto-external conflict | "State X has both auto/branch and external transitions" |
| 8 | Terminal no outgoing | "Terminal state X has outgoing transition to Y" |
| 9 | SubFlow exit completeness | "SubFlow 'X' has terminal Y with no onExit mapping" |
| 10 | SubFlow nesting depth (max 3) | "SubFlow nesting depth exceeds maximum of 3" |
| 11 | SubFlow circular reference | "Circular sub-flow reference detected" |

### Requires/Produces Error Path Analysis

When a processor can fail, the error target state's requirements are checked against:
- Types available BEFORE the processor (guard produces included)
- Processor produces NOT included (processor failed)

## Warnings

| Warning | Condition |
|---------|-----------|
| Liveness risk | Perpetual flow + external transitions |
| Dead data | Types produced but never required downstream |
| Exception route ordering | Superclass before subclass in onStepError routes |

## Accessor Methods

| Method | Returns |
|--------|---------|
| transitionsFrom(state) | All transitions from state |
| externalFrom(state) | First external transition (or null) |
| externalsFrom(state) | All external transitions (for multi-external) |
| allStates() | All states in enum |
| enterAction(state) | Enter callback (or null) |
| exitAction(state) | Exit callback (or null) |
| warnings() | Build-time warning list |
| dataFlowGraph() | DataFlowGraph instance |

## withPlugin(from, to, pluginFlow)

Creates new FlowDefinition with sub-flow inserted before transition A→B.
- Copies: transitions, errorTransitions, enterActions, exitActions, exceptionRoutes, dataFlowGraph, warnings
- Name becomes "originalName+plugin:pluginName"
- Original FlowDefinition is NOT modified (immutable)
