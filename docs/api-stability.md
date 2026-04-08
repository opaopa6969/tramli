# API Stability Policy

## Core API (stable — covered by v1.x guarantee)

These APIs are stable and will not have breaking changes until v2.0.0:

- `FlowDefinition` + `Builder` DSL
- `FlowEngine` (`startFlow`, `resumeAndExecute`)
- `FlowInstance` (state, context, completion)
- `StateProcessor`, `TransitionGuard`, `BranchProcessor` interfaces
- `FlowContext` (`get`, `put`, `find`, `has`)
- `FlowStore` interface
- `MermaidGenerator.generate()` (state diagram output format)
- `DataFlowGraph` core queries: `availableAt`, `producersOf`, `consumersOf`, `deadData`

## Analysis API (stable but may grow — additive changes only)

These APIs are stable for existing methods. New methods may be added:

- `DataFlowGraph`: `lifetime`, `pruningHints`, `impactOf`, `parallelismHints`,
  `toJson`, `toMermaid`, `migrationOrder`, `toMarkdown`, `testScaffold`,
  `generateInvariantAssertions`, `crossFlowMap`, `diff`, `versionCompatibility`,
  `assertDataFlow`, `verifyProcessor`, `isCompatible`
- `MermaidGenerator.generateDataFlow()`, `generateExternalContract()`
- `SkeletonGenerator`
- `FlowInstance`: `statePath`, `waitingFor`, `availableData`, `missingFor`

## Future consideration

If the analysis API surface becomes a maintenance burden, these methods may be
moved to a separate package (`tramli-analysis` / `@unlaxer/tramli-analysis` /
`tramli-analysis` crate) in a future major version. The core API will remain
in the main package.

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
