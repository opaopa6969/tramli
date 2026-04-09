---
status: accepted
---

# DD-035: Issue #15, #17, #25, #26 トリアージ

**Date:** 2026-04-09
**Issues:** #15 (volta-auth-console), #17 (agent-log-broker), #25 (volta-auth-proxy 3.6), #26 (volta-gateway 3.6)

## 既に対応済み — close

### #17 agent-log-broker
- 提案1: `externallyProvided()` → v3.4.0 で実装済み
- 提案2: branchLabel per-processor → v3.4.0 で実装済み (branchLabel マッチング)

### #15 volta-auth-console
- S1: tramli-react → v0.1.0/v0.2.0 で実装済み

## 即実装（v3.6.1）

| # | 内容 | 言語 | 工数 |
|---|------|------|------|
| #25 | `PluginRegistry.analyzeAndValidate(def)` — build 済み定義の lint + throw | TS/Java | S |
| #26-3 | `NoopTelemetrySink` — ベンチマーク baseline | 3 言語 | XS |
| #15-S2 | `Tramli.data()` ヘルパー — flowKey → Map 変換 | TS | S |

## Defer / Close

| # | 内容 | 判定 | 理由 |
|---|------|------|------|
| #26-1 | AsyncFlowStore trait | defer | tramli は sync 設計。store の async 化は docs/patterns/async-store.md で block_on パターンを示す |
| #26-2 | FlowStore::list_by_state | defer | InMemoryFlowStore 固有。SqlFlowStore 実装時に再検討 |
| #15-S3 | セッション再開パターン | close | tramli-react useFlow + resume で対応可能 |
