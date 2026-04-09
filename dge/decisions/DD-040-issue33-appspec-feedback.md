---
status: accepted
---

# DD-040: Issue #33 tramli-appspec 連携フィードバック対応

**Date:** 2026-04-10

## Context

tramli-appspec プロジェクトが Tramli.define().build() を実接続して検証。
4 つの要望が報告された (Issue #33)。

## 要望と判定

### 1. `allowUnreachable()` — 未使用 state の到達可能性チェック緩和

**判定: 採用 (コア)**

| 項目 | 決定 | 理由 |
|------|------|------|
| API | `Builder.allowUnreachable(): this` | `allowPerpetual()` と同パターン |
| 影響 | `checkReachability()` をスキップ | 他の 7 検証はそのまま |
| ユースケース | 共通 enum を複数フローで共有する場合 | stage 差分で未使用 state が発生 |
| リスク | 低 — 到達可能性は安全性チェックではなく設計ヒント | 他の検証（DAG, requires/produces）が本質的 |

### 2. `explainDataAvailability()` — requires/produces デバッグ支援

**判定: 採用 (DataFlowGraph 拡張)**

| 項目 | 決定 | 理由 |
|------|------|------|
| API | `DataFlowGraph.explain(state, key?): ExplainResult` | 既存 `availableAt()` の拡張 |
| 出力 | `{ available: Set, missing: Map<key, {neededBy, lastProducedAt, lostAt}> }` | 「どの経路で失われたか」まで |
| 追加 API | `DataFlowGraph.whyMissing(key, transition): string[]` | 人間可読な説明文の配列 |
| 実装場所 | `data-flow-graph.ts` | 既に依存グラフを持っている |

### 3. `StagePattern` DSL — 定型パターンヘルパー

**判定: NOT-DOING (ユーザー空間)**

| 項目 | 決定 | 理由 |
|------|------|------|
| 場所 | tramli コアには入れない | コアは 8 構成要素に凍結 (DD-016) |
| 代替 | appspec 側で独自ヘルパーを構築 | `Tramli.define()` の上に関数を重ねるだけ |
| 将来 | 需要が複数プロジェクトで確認されたら `tramli-patterns` プラグインとして検討 | |

### 4. 構造化バリデーションエラー — 機械可読な検証結果

**判定: 採用 (コア)**

| 項目 | 決定 | 理由 |
|------|------|------|
| API | `Builder.buildAndValidate(): { definition?, errors: ValidationError[] }` | 例外を投げない版 |
| 型 | `ValidationError { code, state?, transition?, message, missingTypes? }` | 構造化 |
| 既存 `build()` | 変更なし（後方互換） | `buildAndValidate()` は追加 API |
| 既存 `analyzeAndValidate()` | 結果に `errors` フィールドを追加 | 一括解析と統合 |

## 実装順序

1. `allowUnreachable()` — Builder フラグ + checkReachability スキップ (全 3 言語)
2. `ValidationError` 型 + `buildAndValidate()` — 構造化エラー (全 3 言語)
3. `DataFlowGraph.explain()` / `whyMissing()` — TS 先行、Java/Rust 追随

## NOT-DOING

- StagePattern DSL — コア凍結原則。ユーザー空間で十分実現可能。
