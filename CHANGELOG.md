# Changelog

All notable changes to tramli are documented here. Versions are published to
crates.io, npm (@unlaxer/tramli), and Maven Central (org.unlaxer:tramli).

## [1.5.3] - 2026-04-07

### Added
- **tramli-ts CJS dual export** — `require('@unlaxer/tramli')` now works in CommonJS projects
- `dist/esm/` (ESM) + `dist/cjs/` (CJS) dual build

## [1.5.2] - 2026-04-07

### Fixed
- `withPlugin()` StackOverflow — reuse parent DataFlowGraph instead of rebuilding

### Added
- +30 tests for v1.3–v1.5 APIs (total 119 tests across 3 languages)
- CHANGELOG.md

## [1.5.1] - 2026-04-07

### Added
- `FlowContext.registerAlias()` / `toAliasMap()` / `fromAliasMap()` (Java/Rust) for cross-language serialization
- `docs/patterns/io-separation.md` — 3 I/O separation patterns with recommendations
- `docs/patterns/flowstore-schema.md` — recommended DB schema + FlowContext serialization spec
- DD-018: FlowStore service rejected (ROI). Documentation + alias API instead

## [1.5.0] - 2026-04-07

### Added
- `DataFlowGraph.migrationOrder()` — dependency-sorted processor list for migration planning
- `DataFlowGraph.toMarkdown()` — migration checklist generation
- `SkeletonGenerator` — generate Processor skeletons in Java/TypeScript/Rust
- `shared-tests/` — YAML-based cross-language test scenario format + 4 example scenarios

## [1.4.0] - 2026-04-07

### Added
- `DataFlowGraph.impactOf()` — impact analysis for type changes
- `DataFlowGraph.parallelismHints()` — independent processor pairs
- `DataFlowGraph.toJson()` — structured JSON output for IDE/tooling
- `DataFlowGraph.testScaffold()` — required types per processor for test setup
- `DataFlowGraph.generateInvariantAssertions()` — data-flow invariant assertion strings
- `DataFlowGraph.crossFlowMap()` — inter-flow data dependencies
- `DataFlowGraph.diff()` — compare two data-flow graphs
- `DataFlowGraph.versionCompatibility()` — check v1/v2 instance compatibility
- `FlowInstance.availableData()` — types available at current state
- `FlowInstance.missingFor()` — types missing for next transition
- `MermaidGenerator.generateExternalContract()` — external transition data contracts
- `FlowDefinition.withPlugin()` — insert sub-flow before existing transition

## [1.3.0] - 2026-04-07

### Added
- `FlowInstance.statePath()` / `statePathString()` — hierarchical state path
- `FlowInstance.waitingFor()` — types required by current external transition
- `TransitionRecord.subFlow` field — sub-flow name for sub-flow transitions
- MermaidGenerator subgraph rendering for sub-flows
- `docs/language-guide` updated with DataFlowGraph + SubFlow API rows

## [1.2.2] - 2026-04-07

### Added
- `FlowInstance.withVersion(int)` — copy factory for FlowStore optimistic locking

## [1.2.1] - 2026-04-07

### Added
- SubFlow error bubbling — errors without exit mapping fall back to parent's error transitions
- Circular sub-flow reference detection at build time
- Max nesting depth = 3 (build-time validation)

## [1.2.0] - 2026-04-07

### Added
- **SubFlow (Flow Composition)** — embed FlowDefinition inside FlowDefinition (DD-017)
- Builder API: `.subFlow(def).onExit("DONE", state).endSubFlow()`
- `FlowInstance.activeSubFlow()` — active sub-flow reference
- Engine auto-chain recursion into sub-flows + resume delegation
- onExit completeness validation at build time

## [1.1.0] - 2026-04-07

### Added
- `DataFlowGraph.lifetime()` — first produced / last consumed state per type
- `DataFlowGraph.pruningHints()` — types no longer needed at each state
- `DataFlowGraph.assertDataFlow()` — verify context against data-flow invariants
- `DataFlowGraph.verifyProcessor()` — runtime requires/produces verification
- `DataFlowGraph.isCompatible()` — processor interchangeability check
- `FlowError.withContextSnapshot()` — available/missing types on failure

## [1.0.0] - 2026-04-07

### Added
- Error Path Data-Flow Analysis — build-time validation covers error transition paths
- API stability guarantee (DD-016): core API stable for 1+ year

### Changed
- DD-013 accepted: async is optional, sync core is compatible across languages
- DD-014 accepted: data-flow is derived from requires/produces

## [0.2.0] - 2026-04-07

### Added
- **DataFlowGraph** — bipartite graph of types and processors (DD-015)
- `MermaidGenerator.generateDataFlow()` — data-flow Mermaid diagram
- Dead Data Detection — warns on types produced but never required
- Dual View: state transition diagram + data-flow diagram

## [0.1.0] - 2026-04-07

### Fixed
- CloneAny downcast bug in Rust — `Box<dyn CloneAny>` blanket impl caused wrong TypeId

### Added
- Initial release: 3-language constrained flow engine (Java, TypeScript, Rust)
- 8-item build validation
- FlowEngine, FlowDefinition, StateProcessor, TransitionGuard, BranchProcessor
- MermaidGenerator for state transition diagrams
- Published to crates.io, npm, Maven Central
