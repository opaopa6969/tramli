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

## Future (需要確認まで作らない)

| # | Feature | Design |
|---|---------|--------|
| F1 | withPlugin() API | DD-017 |
| F2 | Impact Analysis API | DD-015 brainstorm #2 |
| F3 | Runtime Data Introspection | DD-015 brainstorm #4 |
| F4 | Test Scaffold Generation | DD-015 brainstorm #7 |
| F5 | External Contract View | DD-015 brainstorm #12 |
| F6 | Cross-Flow Data-Flow Map | DD-015 brainstorm #15 |
| F7 | IDE 向け JSON 出力 | DD-015 brainstorm #17 |
| F8 | dve data-flow ビュー | DD-015 brainstorm #22 |
| F9 | Data-Flow Invariant Test Generator | DD-015 brainstorm #25 |
| F10 | Data-Flow Diff (PR レビュー) | DD-015 brainstorm #27 |
| F11 | Version Compatibility Check | DD-015 brainstorm #28 |
| F12 | Domain Vocabulary Map | DD-015 brainstorm #36 |
| F13 | Parallelism Hint | DD-015 brainstorm #8 |

## NOT-DOING (スコープ外)

- Data-Flow-First Builder (DD-015 #9) — 破壊的変更
- Type Annotation PII/Secret (DD-015 #18) — コンプライアンスは tramli 外
- Data Lineage Export (DD-015 #19) — 同上
- Rust proc macro #[derive(Processor)] (DD-015 #21) — 保守コスト過大
- Migration Guide Generator (DD-015 #29) — 需要なし
- AI Processor Generation (DD-015 #32) — AI ツール側の責務
- Processor Registry Pattern (DD-015 #38) — ユーザーが自力で実装可能
- Harel Statechart (DD-017) — 機能過多
