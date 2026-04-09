[日本語版](plugin-guide-ja.md)

# tramli Plugin Guide

tramli is a **verification kernel** — flat semantics, `requires/produces`, build-time validation.
Everything else is a plugin.

> **tramli should become a plugin platform around a frozen verification kernel,
> not a larger monolithic workflow framework.**

## Architecture

```
┌─────────────────────────────────────────┐
│          Plugin Layer                    │
│  audit · eventstore · observability     │
│  hierarchy · resume · lint · testing    │
│  diagram · docs · idempotency          │
├─────────────────────────────────────────┤
│          tramli core (frozen)           │
│  FlowDefinition · FlowEngine           │
│  requires/produces · build() · 8 checks │
│  DataFlowGraph · Pipeline              │
└─────────────────────────────────────────┘
```

## Plugin Types (SPI)

| SPI | Method | Purpose | Examples |
|-----|--------|---------|---------|
| `StorePlugin` | `wrapStore(FlowStore)` | Decorate persistence | AuditStorePlugin, EventLogStorePlugin |
| `EnginePlugin` | `install(FlowEngine)` | Hook into engine lifecycle | ObservabilityEnginePlugin |
| `RuntimeAdapterPlugin<R>` | `bind(FlowEngine)` → `R` | Wrap engine with richer API | RichResumePlugin, IdempotencyPlugin |
| `AnalysisPlugin<S>` | `analyze(FlowDefinition, PluginReport)` | Static analysis | PolicyLintPlugin, SubflowValidator |
| `GenerationPlugin<I,O>` | `generate(I)` → `O` | Code/doc generation | HierarchyPlugin, DiagramPlugin, ScenarioPlugin |
| `DocumentationPlugin<I>` | `generate(I)` → `String` | Markdown generation | FlowDocumentationPlugin |

## Plugin Registry

```java
var registry = new PluginRegistry<OrderState>()
    .register(PolicyLintPlugin.defaults())       // analysis
    .register(new AuditStorePlugin())            // store decorator
    .register(new EventLogStorePlugin())         // store decorator
    .register(new ObservabilityEnginePlugin(sink)); // engine hook

// 1. Analyze
var report = registry.analyzeAll(definition);

// 2. Wrap store
FlowStore store = registry.applyStorePlugins(new InMemoryFlowStore());

// 3. Install engine hooks
FlowEngine engine = Tramli.engine(store);
registry.installEnginePlugins(engine);

// 4. Bind runtime adapters
RichResumeExecutor resume = new RichResumeRuntimePlugin().bind(engine);
```

## What Plugins May and May Not Do

### MAY
- Wrap FlowStore to add audit/event logging
- Hook into FlowEngine's logger callbacks
- Analyze FlowDefinition for policy violations
- Generate code, diagrams, documentation from FlowDefinition
- Provide richer resume/idempotency APIs on top of FlowEngine

### MAY NOT
- Change tramli's build-time validation semantics
- Override requires/produces verification
- Introduce orthogonal regions into core
- Move full event sourcing into core
- Make compensation a core engine responsibility

## v1 Plugins

### Audit
Captures transition + produced-data diffs. Wraps FlowStore.
```java
registry.register(new AuditStorePlugin());
```

### Eventstore-lite (Tenure-lite)
Append-only transition log, replay, stateAtVersion, compensation.
**Not full Tenure** — intentionally lighter.
```java
registry.register(new EventLogStorePlugin());
// Later: replay
new ReplayService().stateAtVersion(events, flowId, version);
```

**Important**: `stateAtVersion()` assumes each event contains a full state snapshot.
If moving to diff-only persistence, replay must become a fold/reducer.

### Observability
Integrates with FlowEngine's logger hooks. Emits TelemetryEvents to a configurable sink.
```java
registry.register(new ObservabilityEnginePlugin(new InMemoryTelemetrySink()));
```

**v3.3.0**: All log entries now include `durationMicros` (integer microseconds).
For high-load I/O sinks, see the [non-blocking sink pattern](patterns/non-blocking-sink.md).

### Rich Resume
Enhanced resumeAndExecute with explicit status classification:
TRANSITIONED, ALREADY_COMPLETE, NO_APPLICABLE_TRANSITION, REJECTED, EXCEPTION_ROUTED.
```java
RichResumeExecutor resume = new RichResumeRuntimePlugin().bind(engine);
var result = resume.resume(flowId, def, data, currentState);
switch (result.status()) { ... }
```

### Idempotency
Duplicate command suppression via commandId tracking.
```java
var idempotent = new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()).bind(engine);
idempotent.resume(flowId, def, new CommandEnvelope("cmd-1", data), state);
```

### Hierarchy Generation
Compiles hierarchical state specs into flat tramli enums + builder skeletons.
Hierarchy is **authoring convenience only** — runtime is always flat.
```java
new HierarchyGenerationPlugin<S>().generate(hierarchicalSpec);
```

### Lint / Policy
Static analysis of FlowDefinition against design policies.
```java
registry.register(PolicyLintPlugin.defaults());
```

**v3.3.0**: Findings now include `FindingLocation` (Transition/State/Data/Flow).
Use `warnAt()` / `errorAt()` to attach structured location to custom policies.

### Diagram / Docs / Testing
Generation plugins for Mermaid diagrams, Markdown documentation, and test scenarios.
```java
new DiagramGenerationPlugin<S>().generate(definition);
new FlowDocumentationPlugin<S>().generate(definition);
new ScenarioGenerationPlugin<S>().generate(definition);
```

**v3.3.0**: `ScenarioTestPlugin` now generates error paths, guard rejection,
and timeout scenarios. Each `FlowScenario` has a `kind` field for filtering.
