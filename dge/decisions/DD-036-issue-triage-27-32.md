---
status: accepted
---

# DD-036: Issue #27-32 トリアージ

**Date:** 2026-04-09
**Issues:** #27 (auth-proxy 3.6.1), #28 (AskOS generateCode), #29 (agent-log-broker DataFlowGraph), #30 (tramli-react), #31/#32 (volta-gateway bench)

## トリアージ

### バグ修正 — 即実装

**#28: generateCode が definition 変数を import しない**
- 生成コードに `definition` 変数の参照があるが import/宣言がない
- fix: generateCode に `// import your definition here` コメント + definition パラメータ名を引数化

### ドキュメント — 即対応

**#27: API Stability Tier**
- Tier 1 (stable): FlowDefinition, FlowEngine, FlowState, StateProcessor
- Tier 2 (evolving): Logger API, Plugin API, DataFlowGraph
- Tier 3 (experimental): Pipeline, Hierarchy, EventStore
- → docs/api-stability.md を作成

**#32: FlowStore trait ドキュメント**
- 「FlowStore trait だけ実装すればエンジンが動く」を明記
- → docs/patterns/custom-flowstore.md

### Close（フィードバック受領 / 重複）

| # | 理由 |
|---|------|
| #29 | DataFlowGraph の positive feedback。actionable な要望なし |
| #31 | #32 と重複 |
| #27 | API Stability docs 対応後 close |
| #32 | FlowStore docs 対応後 close。AsyncFlowStore は既に DD-035 で defer |

### Defer

**#30: FlowProvider + useFlowContext**
- tramli-react v0.3.0 候補
- React Context ベースの Provider で app-wide フロー状態共有
- 設計検討必要（Zustand 統合パターンのドキュメントで当面代替可能）
