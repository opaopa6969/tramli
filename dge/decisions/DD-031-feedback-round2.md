---
status: accepted
---

# DD-031: 4 プロジェクトフィードバック対応 (Issue #14-17)

**Date:** 2026-04-09
**Session:** [DGE Feedback Round 2](../sessions/2026-04-09-feedback-round2.md)
**Issues:** #14 (volta-gateway), #15 (volta-auth-console), #16 (AskOS), #17 (agent-log-broker)

## Decision

### P0 — data-flow 正確性

**D1: externallyProvided() — 外部データの data-flow 宣言 (#17-1)**
- Builder に `.externallyProvided(key)` を追加 (3 言語)
- DataFlowGraph 構築時に、external 遷移の guard.requires に含まれるキーを "externally available" として扱う
- guard の requires 検証にのみ影響。produces は guard.accepted.data で行う（既存メカニズム）
- `initiallyAvailable` との使い分けを明確化

**D2: branch label ごとの processor (#17-2)**
- Transition 構造体に `branch_label: Option<String>` フィールドを追加 (3 言語)
- Engine のマッチロジックを `find(t => t.branch_label === label)` に変更
- フォールバック: branch_label が null の場合は既存の `t.to === target` でマッチ（後方互換）

### P1 — 品質改善

**D3: ObservabilityPlugin に guardLogger hook (#14-S2)**
- ObservabilityPlugin.install() に `set_guard_logger` hook を追加 (3 言語)
- TelemetryEvent に guard accept/reject/expired を emit

**D4: README の multi-external 記述更新 (#16-4)**
- DD-020 で multi-external 追加済みだが README が古い。更新

**D5: allowPerpetual のドキュメント可視性改善 (#16-1)**
- DD-009 で追加済みだが発見しにくい。README + plugin-guide に明記

### P2 — 将来課題

| 提案 | 対応 |
|------|------|
| tramli-react (#15-S1) | 要望蓄積待ち |
| FlowStore 抽象化 (#14-S4) | core 変更大。v4 検討 |
| Builder.strict_mode (#14-S1) | 有用だが今は不要 |
| flowKey Map キー (#15-S2) | 有用だが今は不要 |
| resumeFrom (#15-S3) | 有用だが今は不要 |
| Java/TS FlowDefinition JSON 共有 (#15-Q1) | 将来課題 |
| Lint custom policy API (#14-S5) | Rust は既に open。ドキュメント |

## Rationale

- ハウス診断: externallyProvided は data-flow 検証の正確性の問題。P0
- 右京検証: branch label processor は 3 言語の engine に同じバグ
- ビーン計測: P0+P1 で 2 日。P2 は次セッション以降
