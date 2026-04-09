# tramli backlog

## Completed (v0.1.0 → v1.12.0)

| # | Feature | Version | Design |
|---|---------|---------|--------|
| 1 | CloneAny downcast bug fix | v0.1.0 | — |
| 2 | crates.io initial publish | v0.1.0 | — |
| 3 | DataFlowGraph (3 languages) | v0.2.0 | DD-015 |
| 4 | Mermaid Dual View (state + data-flow) | v0.2.0 | DD-015 |
| 5 | Dead Data Detection | v0.2.0 | DD-015 |
| 6 | 3 registry publish (crates.io + npm + Maven Central) | v0.2.0 | — |
| 7 | Error Path Data-Flow Analysis | v1.0.0 | DD-015 |
| 8 | API stability guarantee | v1.0.0 | DD-016 |
| 9 | Data Lifetime Analysis | v1.1.0 | DD-015 |
| 10 | Context Pruning Hints | v1.1.0 | DD-015 |
| 11 | FlowError context snapshot | v1.1.0 | DD-015 |
| 12 | Requires/Produces runtime verify | v1.1.0 | DD-015 |
| 13 | assertDataFlow() API | v1.1.0 | DD-015 |
| 14 | Processor Compatibility Check | v1.1.0 | DD-015 |
| 15 | SubFlow MVP (Flow Composition) | v1.2.0 | DD-017 |
| 16 | SubFlow error bubbling | v1.2.1 | DD-017 |
| 17 | SubFlow circular reference 検出 | v1.2.1 | DD-017 |
| 18 | SubFlow max nesting depth = 3 | v1.2.1 | DD-017 |
| 19 | FlowInstance.withVersion() | v1.2.2 | request-flowinstance-version-api |
| 20 | SubFlow statePath / statePathString / waitingFor | v1.3.0 | DD-017 |
| 21 | TransitionRecord.subFlow フィールド | v1.3.0 | DD-017 |
| 22 | Mermaid subgraph (SubFlow 描画) | v1.3.0 | DD-017 |
| 23 | impactOf / parallelismHints / toJson | v1.4.0 | DD-015 brainstorm |
| 24 | crossFlowMap / diff / versionCompatibility | v1.4.0 | DD-015 brainstorm |
| 25 | availableData / missingFor | v1.4.0 | DD-015 brainstorm |
| 26 | generateExternalContract | v1.4.0 | DD-015 brainstorm |
| 27 | withPlugin() | v1.4.0 | DD-017 |
| 28 | migrationOrder / toMarkdown | v1.5.0 | proposal-cross-language-portability |
| 29 | SkeletonGenerator (Java/TS/Rust) | v1.5.0 | proposal-cross-language-portability |
| 30 | Shared Test Scenarios (YAML) | v1.5.0 | proposal-cross-language-portability |
| 31 | FlowContext alias API (registerAlias/toAliasMap) | v1.5.1 | DD-018 |
| 32 | I/O separation patterns docs | v1.5.1 | DD-018 |
| 33 | FlowStore schema docs | v1.5.1 | DD-018 |
| 34 | tramli-ts CJS dual export | v1.5.3 | volta-console feedback |
| 35 | FlowInstance.lastError() | v1.6.0 | volta-console feedback |
| 36 | loadForUpdate(flowId, definition) TS | v1.6.0 | volta-console feedback |
| 37 | Auto-chain design intent docs | v1.6.0 | volta-console feedback |
| 38 | strictMode (produces runtime verification) | v1.7.0 | — |
| 39 | Shared scenario tests (Java/TS) | v1.7.0 | — |
| 40 | Paper v3 (test counts, Future Work) | v1.7.0 | — |
| 41 | Rust SubFlow rewrite (stateless factory) | v1.7.1 | code review |
| 42 | Code review fixes (6 items) | v1.8.0 | code review |
| 43 | Logger API (entry record pattern) | v1.9.0 | DGE logger-api |
| 44 | Pipeline API (PipelineStep/Builder/DataFlow/Exception) | v1.10.0 | DD-019 |
| 45 | GraphRenderer (RenderableGraph + render API) | v1.11.0 | DGE graph-renderer |
| 46 | onStepError (exception-typed error routing) | v1.12.0 | DGE liveness-response |
| 47 | FlowDefinition.warnings() (liveness risk) | v1.12.0 | DGE liveness-response |
| 48 | Paper: mathematical genealogy + liveness | v1.12.0 | DGE mathematical-genealogy |

## Documentation (completed)

| Doc | Description |
|-----|-------------|
| Why tramli Works (en/ja) | Attention Budget — human + LLM parallel |
| OIDC Auth Flow example (en/ja) | 9-state production flow with Mermaid |
| Positioning article draft | "Your State Machine Crashes at Runtime" |
| Language compatibility matrix | 16 languages rated for tramli fit |
| API stability policy | Core vs Analysis API scope |
| I/O separation patterns | 3 patterns (External, Port/Adapter, DataProcessor) |
| FlowStore schema | Recommended DB schema + serialization |
| Paper v3 | Definition-Time Validated Constrained Flow Engine |
| README full API reference (en/ja) | 49 sections, all methods documented |

## DGE Sessions (10 total)

| Session | Rounds | DD |
|---------|--------|-----|
| data-flow brainstorm | 7 | DD-015 |
| v1.0.0 readiness | 1 | DD-016 |
| state tree | 8 | DD-017 |
| flowstore portability | 1 | DD-018 |
| pipeline vision | 7 | DD-019 |
| mathematical genealogy | 1 | — |
| liveness response | 1 | — |
| logger API | 2 | — |
| graph renderer | 1 | — |
| coverage vision | 1 | — |
| I/O coverage | 1 | — |

## Design Decisions (DD-001 → DD-019)

See [dge/decisions/index.md](../dge/decisions/index.md)

## Future

| # | Feature | Design | 前提 |
|---|---------|--------|------|
| F14 | Per-state timeout on External transitions | ✅ complete (v1.15.0) | — |
| F16 | tramli-ports (言語横断 I/O 契約共有) | 需要が出たら | — |
| F17 | 3言語実装差異の解消 (P0〜P2 全22項目) | ✅ complete — DD-026 | — |
| F18 | tramli-viz リアルタイム監視デモ | ✅ complete — DD-027 | — |

## NOT-DOING (スコープ外)

- Data-Flow-First Builder (DD-015 #9) — 破壊的変更
- Type Annotation PII/Secret (DD-015 #18) — コンプライアンスは tramli 外
- Data Lineage Export (DD-015 #19) — 同上
- Rust proc macro #[derive(Processor)] (DD-015 #21) — 保守コスト過大
- Migration Guide Generator (DD-015 #29) — 需要なし
- AI Processor Generation (DD-015 #32) — AI ツール側の責務
- Processor Registry Pattern (DD-015 #38) — ユーザーが自力で実装可能
- Harel Statechart (DD-017) — 機能過多
- FlowStore Service (DD-018) — ROI 不足
- Sub-Pipeline — asStep() で十分
- Parallel execution — 検証できないものは入れない原則
