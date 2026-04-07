# tramli backlog

| # | Feature | Status | Design | Depends on |
|---|---------|--------|--------|------------|
| 1 | CloneAny downcast bug fix | ✅ complete | — | — |
| 2 | crates.io v0.1.0 publish | ✅ complete | — | #1 |
| 3 | DataFlowGraph (3 languages) | ✅ complete | DD-015 | — |
| 4 | Mermaid Dual View (state + data-flow) | ✅ complete | DD-015 | #3 |
| 5 | Dead Data Detection | ✅ complete | DD-015 | #3 |
| 6 | v0.2.0 publish (3 registries) | ✅ complete | — | #3,#4,#5 |
| 7 | Error Path Data-Flow Analysis | ✅ complete | DD-015 | #3 |
| 8 | v1.0.0 release (API stability) | ✅ complete | DD-016 | #7 |
| 9 | Data Lifetime Analysis | ✅ complete | DD-015 | #3 |
| 10 | Context Pruning Hints | ✅ complete | DD-015 | #9 |
| 11 | FlowError context snapshot | ✅ complete | DD-015 | — |
| 12 | Requires/Produces verify (runtime) | ✅ complete | DD-015 | — |
| 13 | assertDataFlow() API | ✅ complete | DD-015 | #3 |
| 14 | Processor Compatibility Check | ✅ complete | DD-015 | — |
| 15 | v1.1.0 publish | ✅ complete | — | #9–#14 |
| 16 | SubFlow MVP (Flow Composition) | ✅ complete | DD-017 | — |
| 17 | v1.2.0 publish | ✅ complete | — | #16 |
| 18 | SubFlow error bubbling | ✅ complete | DD-017 | #16 |
| 19 | SubFlow data-flow 結合検証 | ✅ complete | DD-017 | #16 |
| 20 | SubFlow circular reference 検出 | ✅ complete | DD-017 | #16 |
| 21 | SubFlow max nesting depth = 3 | ✅ complete | DD-017 | #16 |
| 22 | SubFlow statePath 永続化 | ✅ complete | DD-017 | #16 |
| 23 | FlowInstance.restore() オーバーロード | ✅ complete | DD-017 | #22 |
| 24 | TransitionRecord.subFlow フィールド | ✅ complete | DD-017 | #16 |
| 25 | FlowInstance.waitingFor() | ✅ complete | DD-017 | #16 |
| 26 | FlowInstance.statePath() / statePathString() | ✅ complete | DD-017 | #22 |
| 27 | Mermaid subgraph (SubFlow 描画) | ✅ complete | DD-017 | #16 |
| 28 | DataFlowGraph SubFlow フラット化 | ✅ complete | DD-017 | #16,#3 |
| 29 | DD-013 sync 互換性テスト (shared test) | ✅ complete | DD-013 | — |
| 30 | docs/language-guide DataFlowGraph 行追加 | ✅ complete | — | #3 |

## Future → Complete (v1.4.0)

| # | Feature | Status |
|---|---------|--------|
| F1 | withPlugin() API | ✅ complete |
| F2 | Impact Analysis API | ✅ complete |
| F3 | Runtime Data Introspection | ✅ complete |
| F4 | Test Scaffold Generation | ✅ complete |
| F5 | External Contract View | ✅ complete |
| F6 | Cross-Flow Data-Flow Map | ✅ complete |
| F7 | IDE 向け JSON 出力 | ✅ complete |
| F8 | dve data-flow ビュー | ✅ complete (toJson() で dve 消費可能) |
| F9 | Data-Flow Invariant Test Generator | ✅ complete |
| F10 | Data-Flow Diff (PR レビュー) | ✅ complete |
| F11 | Version Compatibility Check | ✅ complete |
| F12 | Domain Vocabulary Map | ✅ complete (type names in graph) |
| F13 | Parallelism Hint | ✅ complete |

## Open

| # | Feature | Status | Design | Depends on |
|---|---------|--------|--------|------------|
| 31 | tramli-ts: CJS dual export | ✅ complete | — | — |
| 32 | FlowInstance.withVersion() 周知 | ✅ complete (v1.2.2) | — | — |
| 33 | Cross-Language Portability (提案書) | ✅ complete (DD-018, v1.5.0-1.5.1) | docs/proposal-cross-language-portability.md | — |

### 31: tramli-ts CJS dual export

tramli-ts は現在 ESM のみ。CommonJS プロジェクト（volta-platform 等）から使うには `await import()` が必要。

tsconfig で CJS ビルドも出力し、package.json の exports で dual export にする:

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs"
    }
  }
}
```

**背景**: volta-platform（Node.js/Express, CommonJS）への tramli 導入で判明。dynamic import で回避可能だが、ライブラリとして dual export が望ましい。

## NOT-DOING (スコープ外)

- Data-Flow-First Builder (DD-015 #9) — 破壊的変更
- Type Annotation PII/Secret (DD-015 #18) — コンプライアンスは tramli 外
- Data Lineage Export (DD-015 #19) — 同上
- Rust proc macro #[derive(Processor)] (DD-015 #21) — 保守コスト過大
- Migration Guide Generator (DD-015 #29) — 需要なし
- AI Processor Generation (DD-015 #32) — AI ツール側の責務
- Processor Registry Pattern (DD-015 #38) — ユーザーが自力で実装可能
- Harel Statechart (DD-017) — 機能過多
