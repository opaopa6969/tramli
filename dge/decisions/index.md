# Design Decisions — tramli

| DD | Title | Session | Date |
|----|-------|---------|------|
| [DD-001](DD-001-ttl-semantics.md) | TTL は external resume の有効期限 | [R2](../sessions/2026-04-07-tramli-design-review-r2.md) | 2026-04-07 |
| [DD-002](DD-002-no-compensation-no-per-state-timeout.md) | 補償機構と per-state タイムアウトは v0.1.0 に入れない | [R3](../sessions/2026-04-07-tramli-design-review-r3.md) | 2026-04-07 |
| [DD-003](DD-003-native-over-http.md) | ネイティブ移植が本線、HTTP API は監視レイヤー | [multilang](../sessions/2026-04-07-tramli-multilang-strategy.md) | 2026-04-07 |
| [DD-004](DD-004-typescript-only-v010.md) | v0.1.0 の移植対象は TypeScript のみ | [multilang](../sessions/2026-04-07-tramli-multilang-strategy.md) | 2026-04-07 |
| [DD-005](DD-005-flowkey-branded-string.md) | FlowContext キーは FlowKey branded string | [multilang-r2](../sessions/2026-04-07-tramli-multilang-r2.md) | 2026-04-07 |
| [DD-006](DD-006-async-flow-engine.md) | TypeScript 版 FlowEngine は全 async | [multilang-r2](../sessions/2026-04-07-tramli-multilang-r2.md) | 2026-04-07 |
| [DD-007](DD-007-http-api-deferred.md) | HTTP API は v0.2.0 に先送り | [multilang-r4](../sessions/2026-04-07-tramli-multilang-r4.md) | 2026-04-07 |
| [DD-008](DD-008-rust-for-volta-proxy-python-csharp-skip.md) | Rust は volta-gateway 向け。Python/C# は作らない | [multilang](../sessions/2026-04-07-tramli-multilang-strategy.md) | 2026-04-07 |
| [DD-009](DD-009-allow-perpetual.md) | allow_perpetual() — terminal なし永続ループ | [rust-r2](../sessions/2026-04-07-tramli-rust-r2-volta-patterns.md) | 2026-04-07 |
| [DD-010](DD-010-rust-clone-any-typeid-async.md) | Rust 型設計: CloneAny + TypeId + native async | [rust-design](../sessions/2026-04-07-tramli-rust-design.md) | 2026-04-07 |
| [DD-011](DD-011-volta-gateway-tramli-scope.md) | volta-gateway での tramli 適用範囲 | [rust-r2](../sessions/2026-04-07-tramli-rust-r2-volta-patterns.md) | 2026-04-07 |
| [DD-012](DD-012-rust-sync-engine.md) | Rust 版は完全 sync（DD-010 async 部分を撤回） | [async-diagnosis](../sessions/2026-04-07-tramli-rust-async-diagnosis.md) | 2026-04-07 |
| [DD-013](DD-013-all-languages-sync-core.md) | ⚠️ draft: 全言語 sync コアに統一（DD-006 撤回検討） | — | 2026-04-07 |
| [DD-014](DD-014-data-flow-derived-not-defined.md) | draft: data-flow は定義ではなく導出 | — | 2026-04-07 |
| [DD-015](DD-015-dataflow-graph-core.md) | DataFlowGraph をコアに + v0.2.0 スコープ | [dataflow-brainstorm](../sessions/2026-04-07-tramli-dataflow-brainstorm.md) | 2026-04-07 |
| [DD-016](DD-016-v1-release.md) | tramli v1.0.0 リリース | [v1-readiness](../sessions/2026-04-07-tramli-v1-readiness.md) | 2026-04-07 |
| [DD-017](DD-017-flow-composition-subflow.md) | Flow Composition（サブフロー） | [state-tree](../sessions/2026-04-07-tramli-state-tree.md) | 2026-04-07 |
