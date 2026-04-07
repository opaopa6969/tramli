# DD-013: 全言語 sync コア互換 — async は optional

**Date:** 2026-04-07
**Status:** accepted

## Decision

全言語の sync コア API は互換性を維持する。async は言語ごとの optional 拡張として許容し、互換性の対象外とする。

- **Java**: sync のみ（変更なし）
- **TypeScript**: sync + optional async（processor.process() が `Promise<void> | void` を返せる現行仕様を維持）
- **Rust**: sync のみ（DD-012 の通り）

## 互換性の範囲

**sync コア（3 言語で互換）:**
- FlowDefinition Builder DSL
- FlowState interface (isTerminal, isInitial)
- StateProcessor / TransitionGuard / BranchProcessor の requires/produces 宣言
- DataFlowGraph API
- MermaidGenerator 出力フォーマット
- 8-item build validation

**言語固有（互換性対象外）:**
- TypeScript の async engine / async processor
- 各言語の FlowStore 実装
- エラー型の詳細

## Rationale

- `async-integration.md`: 「tramli is intentionally synchronous. It makes judgments in microseconds」
- sync コアは全言語で最もシンプル、テストしやすい、ポータブル
- TS の async はエコシステム上自然であり、撤回する必要はない
- DD-006 (TS async) は撤回せず維持。ただし async は optional 拡張の位置づけ

Supersedes: なし（DD-006 は維持、スコープ明確化のみ）
