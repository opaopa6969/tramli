---
status: accepted
---

# DD-017: Flow Composition（サブフロー）による階層的状態の実現

**Date:** 2026-04-07
**Session:** [state-tree](../sessions/2026-04-07-tramli-state-tree.md)

## Decision

状態のネスト（Harel Statechart）ではなく、**FlowDefinition の中に別の FlowDefinition を埋め込む Flow Composition** で階層的状態を実現する。enum は閉じたまま。

### 却下した案

- **案 A (Harel Statechart)**: 機能過多（entry/exit actions, history state, orthogonal regions）。tramli の「シンプルさ」と矛盾
- **案 B (ドット記法)**: 案 C があれば不要。表示グルーピングは Mermaid 側で対応

## API

```java
// サブフロー定義（独立した FlowDefinition）
var paymentSub = Tramli.define("payment-detail", PaymentStep.class)
    .from(INIT).auto(VALIDATE, validateProc)
    .from(VALIDATE).external(CONFIRM, confirmGuard)
    .from(CONFIRM).auto(DONE, finalizeProc)
    .build();

// メインフロー
.from(PAYMENT).subFlow(paymentSub)
    .onExit("DONE", PAYMENT_DONE)
    .onExit("CANCELLED", CANCELLED)
```

## 実行モデル

- **Context**: 完全共有（同じ FlowContext）
- **TTL**: 親が支配。サブフローの ttl は埋め込み時に無視
- **auto-chain**: 再帰実行。depth は全体合算（max 10）
- **resume**: activeSubFlow に委譲
- **エラー**: 3 層（サブフロー内解決 → error terminal → 親バブリング）
- **guardFailureCount**: サブフローの FlowInstance に帰属
- **re-entry**: 毎回 fresh start（initial state から）

## 設計原則

1. **サブフローは親を知らない** — 親の情報は context 経由で明示的に渡す
2. **設定の支配ルール** — フローレベル（TTL, flowId）= 親、遷移レベル（maxGuardRetries, error transitions）= 各定義
3. **キャンセルは専用 API 不要** — サブフロー内 terminal + onExit で対応
4. **条件付きサブフローは branch + subFlow** — 専用 API は作らない
5. **同一サブフロー定義の複数箇所利用 OK**
6. **サブフロー別ファイル分割推奨**

## ビルド検証

- onExit 網羅性（サブフローの全 terminal に対応する onExit が必要）
- data-flow 結合（親の available set ⊇ サブフローの requires）
- circular reference 検出（オブジェクト identity）
- max nesting depth = 3

## 型パラメータ

- Java: 型消去（`FlowDefinition<?>`）
- TypeScript: 自然対応（`S extends string`）
- Rust: trait object（`Box<dyn SubFlow>`）

## 永続化

statePath: `["PAYMENT", "CONFIRM"]` で保存。restore 時に再構築。

## 制限事項

- terminal 状態の後に状態追加はできない（Plugin でも不可）
- max nesting depth = 3

## v1.2.0 MVP

1. SubFlowTransition + Builder `.subFlow().onExit()`
2. onExit 網羅性検証（ビルド時）
3. FlowInstance.activeSubFlow
4. Engine auto-chain 再帰 + resume 委譲
5. テスト: Basic subFlow + SubFlow with external

## 段階リリース

```
v1.2.0: MVP（上記 5 項目）
v1.2.1: エラーバブリング + data-flow 結合検証 + circular ref + nesting depth
v1.2.2: statePath + restore + TransitionRecord.subFlow + waitingFor() + statePathString()
v1.2.3: Mermaid subgraph + DataFlowGraph フラット化
(withPlugin は future — 需要確認まで)
```

## NOT-DOING

- Harel Statechart（entry/exit, history, orthogonal）
- withPlugin（future — YAGNI）
- サブフローのスコープ分離（完全共有で十分）
- サブフロー専用の TTL
