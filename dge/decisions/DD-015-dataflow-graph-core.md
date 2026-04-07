---
status: accepted
---

# DD-015: DataFlowGraph をコアに埋め込み、v0.2.0 で data-flow 導出を実装する

**Date:** 2026-04-07
**Session:** [dataflow-brainstorm](../sessions/2026-04-07-tramli-dataflow-brainstorm.md)

## Decision

1. `FlowDefinition.build()` 時に DataFlowGraph（二部グラフ）を構築し、FlowDefinition 内に保持する
2. `def.dataFlowGraph()` で公開 API として取得可能にする
3. MermaidGenerator に data-flow モードを追加（Dual View: 状態遷移図 + data-flow 図）
4. 3 言語（Java/TS/Rust）で共通の Mermaid 出力フォーマット
5. Dead Data Detection をビルド時バリデーションに追加

## v0.2.0 スコープ（5 個のみ）

| # | アイデア | 性質 |
|---|---------|------|
| 34 | DataFlowGraph をコアに（二部グラフ） | 土台 |
| 35 | 二部グラフ表現 | #34 の内部設計 |
| 1 | Dual View Mermaid | 可視化 |
| 5 | 共通 Mermaid 出力 | 3 言語統一 |
| 3 | Dead Data Detection | ビルド検証 |

## DataFlowGraph 構造

二部グラフ: 型ノード（TypeId/Class/FlowKey）と処理ノード（Processor/Guard 名）

```
[OrderRequest] --requires--> (OrderInit) --produces--> [PaymentIntent]
[PaymentIntent] --requires--> (PaymentGuard) --produces--> [PaymentResult]
[PaymentResult] --requires--> (ShipProcessor) --produces--> [ShipmentInfo]
```

### 公開 API

```
def.dataFlowGraph()
  .availableAt(state) → Set<TypeId>
  .producersOf(typeId) → List<ProducerInfo>
  .consumersOf(typeId) → List<ConsumerInfo>
  .deadData() → List<TypeId>
  .toMermaid() → String
```

## NOT-DOING（スコープ外）

- #9 Data-Flow-First Builder — 破壊的変更、ユーザーゼロで不要
- #18 Type Annotation（PII 等）— コンプライアンスは tramli のスコープ外
- #19 Data Lineage Export — 同上
- #21 Rust proc macro — 保守コスト過大
- #29 Migration Guide Generator — マイグレーション需要なし
- #32 AI Processor Generation — AI ツール側の責務
- #38 Processor Registry Pattern — ユーザーが自力で実装可能

## v0.3.0 候補

#10 Error Path Analysis, #30 Data Lifetime Analysis, #31 Context Pruning Hint, #11 FlowError context snapshot, #20 Requires/Produces 自動検証, #26 assertDataFlow() API, #37 Processor Compatibility Check

## Rationale

- `checkRequiresProduces` が既に data-flow グラフと同等の走査をしている。グラフを明示的に構築してもコスト増はほぼゼロ
- 状態遷移図は「制御の流れ」、data-flow 図は「データの流れ」。両方あって初めて全体像が見える
- Dead Data Detection は「produces されたが requires されない型」の検出。デッドコードと同じ問題
- 3 言語で共通の Mermaid フォーマットにすれば、言語間で自然に diff 可能
- Airflow/Temporal にない「ビルド時 data-flow 検証」が tramli の差別化ポイント
