# DD-043: アプリ全体の宣言的記述は tramli ファミリーの合成で行う（tramli-sdd は吸収）

**Date:** 2026-04-24
**Session:** [Reactive & App Structure](../sessions/2026-04-24-tramli-reactive-and-app-structure.md)

## Decision

アプリケーション全体を宣言的・構造的に定義するために、単一 DSL の拡張ではなく、
**単機能の宣言系を合成する「tramli ファミリー」モデル** を採用する。

### ファミリー構成（現状認識 + 追加 + 吸収）

| メンバー | 状態 | 担当領域 |
|---------|------|---------|
| **tramli** | v3.7.1 実装済 | Statechart + data-flow 検証カーネル |
| **tramli-appspec** | 21 classes 実装済、Epic 1-6 完了 | ApplicationSpec（Task / Flow / Entity / Field / Role / Projection / RuntimePolicy）+ pipeline orchestrator |
| **tramli-reactive** | 未着手（API スケッチ先行） | 並行・通信層（π-calculus 系譜、セッション型） |

### 責務境界

```
tramli         : 「この workflow が data-flow として成立するか」を検証する
tramli-appspec : 「この business app を構造化された spec に落とし込み、
                  人間レビューを挟みながら段階的に生成する」
tramli-reactive: 「並行プロセス間の通信を型安全に記述する」
                  （未実装、API スケッチのみ）

非ゴール:
  - tramli は app spec を持たない（tramli-appspec に委譲）
  - tramli-appspec は通信層を持たない（tramli-reactive に委譲）
  - tramli-reactive は state machine を再発明しない（tramli に委譲）
```

### 吸収対象: tramli-sdd

**tramli-sdd** は独立プロジェクトとしては解体し、以下に吸収する:

| tramli-sdd の層 | 吸収先 | 備考 |
|-----------------|-------|------|
| L1 Flow Saturation | **tramli** の `DataFlowGraph` | すでに tramli が提供。tramli-appspec 側の `TramliStyleFlowValidator` を DataFlowGraph 直接利用に置き換える |
| L2 Validation Coverage | **tramli-appspec** の validation package | 既存の ValidationReport / ValidationIssue を拡張 |
| L3 Business Rule Patterns | **tramli-appspec** の RuntimePolicySpec 拡張 | パターンカタログは RuntimePolicy の一種として扱う |

### 不採用（ファミリーには含めない）

- tramli-form / tramli-view / tramli-store / tramli-guard / tramli-topo の独立パッケージ化
  → これらの責務は tramli-appspec の Spec 型（TaskSpec の HumanTask / EntitySpec / FieldSpec /
    RoleSpec / ProjectionSpec / RuntimePolicySpec）で既に表現できており、重複する

## Rationale

- 単一 DSL で UI・通信・永続化・認可まで書こうとする試みは歴史的に失敗する
  （UML 統一の挫折、BPMN の肥大化）
- 既に **tramli-appspec が「workflow-first の app 宣言系」として実装済み**であり、
  仮想的な家族を新設する必要がない
- tramli-appspec は pipeline orchestrator 自身を **tramli の FlowDefinition で自己記述**
  しており、ファミリー合成モデルの現物実装として既に機能している
- tramli-sdd は未実装のまま設計意図が tramli の DataFlowGraph と重複しているため、
  吸収することで二重実装と divergence risk を解消できる
  （tramli-appspec README の Known Limitation で既に認識されている課題）
- 未カバー領域（並行・通信層）のみ **tramli-reactive** として新規追加する

## Implementation Plan

1. **先行（設計のみ）**: 家族マニフェスト執筆 — tramli / tramli-appspec / tramli-reactive の
   責務境界、合成接続ポイント、非ゴールを明文化。tramli-sdd 吸収方針も記述
2. **次**: tramli-appspec の `TramliStyleFlowValidator` を tramli の DataFlowGraph 利用に
   書き換え（tramli-sdd L1 吸収の実体作業）
3. **その次**: tramli-sdd の L2/L3 仕様を tramli-appspec に統合
4. **並行**: tramli-reactive の API スケッチのみ（実装なし、型と define 形）

## Alternatives considered

- tramli-sdd を独立プロジェクトとして完成させる → 却下（DataFlowGraph と重複、
  tramli-appspec の Known Limitation で既に認識済み）
- 新しい家族（form / view / store / guard）を tramli-appspec と並行して作る → 却下（重複）
- tramli 本体に app spec 機能を統合 → 却下（DD-042 の exemplar 完結原則に反する）
- tramli-appspec を吸収して tramli 本体に統合 → 却下（DD-042 と衝突、
  tramli-appspec は独自アイデンティティ「人間レビュー込み段階生成」を持つ）
