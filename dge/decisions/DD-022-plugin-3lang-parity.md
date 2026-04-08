---
status: accepted
---

# DD-022: Plugin Pack — 3 Language Parity (Java/TS/Rust)

**Date:** 2026-04-09

## Decision

14 Java plugins を TypeScript と Rust にフル移植し、3言語で同一のプラグインセットを提供する。

## Context

- Java 版 `java-plugins/` に 14 プラグイン（6 SPI 型）が既に存在
- TS/Rust コア (`ts/`, `rust/`) は v2.0.0 でプラグインなし
- ユーザーの指示: 「フルでお願いします。時間はかかっていいから丁寧にお願いします」

## Plugins Ported (14)

| Plugin | SPI Type |
|--------|----------|
| AuditStorePlugin | Store |
| EventLogStorePlugin | Store |
| ReplayService | — |
| ProjectionReplayService | — |
| CompensationService | — |
| ObservabilityEnginePlugin | Engine |
| RichResumeRuntimePlugin | RuntimeAdapter |
| IdempotencyRuntimePlugin | RuntimeAdapter |
| PolicyLintPlugin | Analysis |
| DiagramGenerationPlugin | Generation |
| HierarchyGenerationPlugin | Generation |
| ScenarioGenerationPlugin | Generation |
| FlowDocumentationPlugin | Documentation |
| GuaranteedSubflowValidator | — |

## Language Adaptations

- **Java:** `Enum<S> & FlowState`, `Class<?>` keys, `Map<Class<?>, Object>` context
- **TypeScript:** `S extends string`, `FlowKey<T>` branded strings, `Map<string, unknown>` context
- **Rust:** `S: FlowState` trait bound, `TypeId` keys, `Box<dyn CloneAny>` context

## Test Coverage

- Java: 11 integration tests (existing)
- TypeScript: 21 integration tests (new)
- Rust: 14 integration tests (new)

## Packages

```
java-plugins/   → org.unlaxer:tramli-plugins   (Maven Central)
ts-plugins/     → @unlaxer/tramli-plugins       (npm)
rust-plugins/   → tramli-plugins                (crates.io)
```
