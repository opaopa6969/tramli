---
status: accepted
---

# DD-016: tramli v1.0.0 リリース

**Date:** 2026-04-07
**Session:** [v1-readiness](../sessions/2026-04-07-tramli-v1-readiness.md)

## Decision

tramli v1.0.0 をリリースする。v0.2.0 + Error Path Data-Flow Analysis (#10) = v1.0.0。

## v1.0.0 の安定性約束

1. コア API（FlowEngine, Builder, processors, FlowContext）は壊さない
2. DataFlowGraph の query API は壊さない
3. MermaidGenerator の出力フォーマットは壊さない
4. 3 言語で同じ**コア API**（分析系は言語ごとに先行/後追い可）
5. v1.x 維持期間は最低 1 年

## Rationale

- コア API は v0.1.0 から安定しており、v0.2.0 も additive のみ
- ユーザーゼロの今が v1.0.0 最適タイミング（0.x→1.0 移行の混乱なし）
- v1.0.0 = 「プロダクションに入れていい」シグナル
- Error Path Analysis を入れることで「ビルド時検証は完全」と言い切れる

## v1.1.0+ 候補

- #30 Data Lifetime Analysis + #31 Context Pruning Hint
- #11 FlowError context snapshot
- #20 Requires/Produces 自動検証
- #26 assertDataFlow() API
- #37 Processor Compatibility Check
