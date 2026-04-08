# tramli plugin pack architecture (revised)

This pack keeps tramli core semantics unchanged.

## Design rule

Plugins are limited to one of these shapes:

1. **AnalysisPlugin**
   - reads `FlowDefinition` and emits findings
   - example: `PolicyLintPlugin`
2. **StorePlugin**
   - wraps `FlowStore`
   - examples: `AuditStorePlugin`, `EventLogStorePlugin`
3. **EnginePlugin**
   - installs listeners or instrumentation on `FlowEngine`
   - example: `ObservabilityEnginePlugin`
4. **RuntimeAdapterPlugin**
   - binds a `FlowEngine` to helper runtimes without changing core semantics
   - examples: `RichResumeRuntimePlugin`, `IdempotencyRuntimePlugin`
5. **GenerationPlugin / DocumentationPlugin**
   - turns authoring models or flow definitions into artifacts
   - examples: diagram, docs, scenario plans, hierarchy code generation

## Why this preserves tramli quality

- No plugin overrides `available_at` semantics.
- No plugin mutates `FlowDefinition` internals.
- Orthogonal regions are intentionally excluded.
- Hierarchy is compiled or generated externally rather than added to core execution semantics.
- Tenure-like durability is added as a store/runtime layer rather than fused into the validator.

## Revised hierarchy model

`HierarchicalStateSpec` explicitly carries:

- `initial`
- `terminal`
- `entryProduces`
- `exitProduces`

The generator trusts the spec and does not infer terminality from names.

## Revised event-store model

The event-store plugin is now **Tenure-lite**:

- append-only `VersionedTransitionEvent`
- event types: `TRANSITION`, `COMPENSATION`
- `ReplayService.stateAtVersion(...)` for latest snapshot replay
- `ProjectionReplayService.stateAtVersion(...)` for projection-based rebuilds
- `CompensationService` and `CompensationResolver` for explicit compensation logging

This still avoids replacing tramli core with full event sourcing.

## Inventory

- `audit` - captures produced-data diffs per transition
- `resume` - richer resume result helper
- `diagram` - Mermaid and data-flow render bundle
- `lint` - design-time policy checks
- `testing` - scenario plan generation
- `observability` - engine instrumentation
- `subflow` - guaranteed parent-data validator
- `hierarchy` - Carta-style authoring model + Java source generation
- `eventstore` - append-only transition + compensation log + projection replay
- `idempotency` - command-id duplicate suppression helper
- `docs` - markdown flow catalog generation
