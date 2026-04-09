# API Stability Tiers

tramli の公開 API を 3 つの安定性レベルに分類します。

## Tier 1 — Stable

**Minor バージョンで破壊的変更なし。** 安心して依存できます。

| API | 言語 |
|-----|------|
| `FlowDefinition` / `Builder` | TS/Java/Rust |
| `FlowEngine` (start/resume/loggers) | TS/Java/Rust |
| `FlowState` / `StateConfig` | TS/Java/Rust |
| `StateProcessor` / `TransitionGuard` / `BranchProcessor` | TS/Java/Rust |
| `FlowContext` (get/put/has/find) | TS/Java/Rust |
| `FlowInstance` | TS/Java/Rust |
| `InMemoryFlowStore` | TS/Java/Rust |
| `FlowStore` trait | Rust |
| `FlowError` / `FlowException` | TS/Java/Rust |
| `MermaidGenerator` | TS/Java/Rust |
| `flowKey` / `FlowKey` | TS |
| `Tramli` (define/engine/data) | TS |

## Tier 2 — Evolving

**Minor バージョンで追加・拡張あり。** 既存メソッドのシグネチャは維持しますが、新メソッド・新フィールドが追加されることがあります。

| API | 言語 |
|-----|------|
| Logger API (TransitionLogEntry 等) | TS/Java/Rust |
| Plugin API (PluginRegistry, EnginePlugin 等) | TS/Java |
| DataFlowGraph | TS/Java/Rust |
| ObservabilityPlugin / TelemetrySink | TS/Java/Rust |
| `useFlow` hook | TS (tramli-react) |

## Tier 3 — Experimental

**Patch バージョンでも変わりうる。** フィードバックを元に API が変更される可能性があります。

| API | 言語 |
|-----|------|
| Pipeline API | TS |
| Hierarchy plugin (EntryExitCompiler 等) | TS/Java |
| EventStore plugin (replay/projection) | TS/Java/Rust |
| ScenarioTestPlugin.generateCode() | TS |
| SkeletonGenerator | TS |

## バージョニングポリシー

- **Major** (x.0.0): Tier 1 API の破壊的変更時のみ
- **Minor** (3.x.0): Tier 2 API の追加・変更、新機能
- **Patch** (3.6.x): バグ修正、Tier 3 API の変更、ドキュメント

## Migration notes

### v1.15.0 — per-state timeout

`FlowInstance` gains a `stateEnteredAt` field (Instant/Date). This is set
automatically on state transitions. Custom `FlowStore` implementations that
persist/restore FlowInstance should include this field:

- **Java**: `FlowInstance.stateEnteredAt()` — `Instant`
- **TypeScript**: `FlowInstance.stateEnteredAt` — `Date`

If your FlowStore does not persist `stateEnteredAt`, per-state timeouts will
use the flow creation time as fallback (conservative — may expire earlier
than expected on restored flows). To get accurate per-state timeouts,
persist and restore this field.
