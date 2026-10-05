[日本語版](plugin-guide-ja.md)

# tramli Plugin Guide

Use this reference to choose a plugin for audit logs, transition history, monitoring, or duplicate external events, and to check its API and limits.
For a flow you can run step by step, start with the [Plugin Tutorial](tutorial-plugins.md).
The examples below use TypeScript; both language versions of this guide cover the same APIs and examples.

## Architecture

A flow definition says which states and transitions exist. That alone does not tell you which transition a particular request took, how long it ran, or whether a webhook was delivered twice. Adding these concerns to every Processor would repeat the same logging and duplicate checks throughout the application.

tramli provides wrappers around storage and execution, plus tools that read flow definitions. You add the pieces you need. The core still executes the flow and performs its 8 structural checks at `build()`, including the `requires` / `produces` data dependencies.

These examples describe the source on `main`; check the API of the version you install. Core classes come from `@unlaxer/tramli`, and plugins from `@unlaxer/tramli-plugins`. Names and type parameters differ by language: see the [TypeScript exports](../lang/ts-plugins/src/index.ts), [Java implementation](../lang/java-plugins/src/main/java/org/unlaxer/tramli/plugins), and [Rust implementation](../lang/rust-plugins/src).

## Plugin Types (SPI)

SPI (Service Provider Interface) means an interface for adding a plugin. The six interfaces below are the TypeScript API; `S` is the state type, `I` the input, `O` the output, and `R` the bound adapter.

| Need | SPI | Method | Implementation |
|------|-----|--------|----------------|
| Record transitions when they are saved | `StorePlugin` | `wrapStore(store)` | `AuditStorePlugin`, `EventLogStorePlugin` |
| Collect execution telemetry | `EnginePlugin` | `install(engine)` | `ObservabilityEnginePlugin` |
| Classify resume results or suppress duplicate commands | `RuntimeAdapterPlugin<R>` | `bind(engine)` | `RichResumeRuntimePlugin`, `IdempotencyRuntimePlugin` |
| Check design policies | `AnalysisPlugin<S>` | `analyze(definition, report)` | `PolicyLintPlugin` |
| Generate source, diagrams, or test plans | `GenerationPlugin<I, O>` | `generate(input)` | `HierarchyGenerationPlugin`, `DiagramGenerationPlugin`, `ScenarioGenerationPlugin` |
| Generate Markdown | `DocumentationPluginSPI<I>` | `generate(input)` | `FlowDocumentationPlugin` |

`DocumentationPluginSPI` is the exported name of the documentation interface. `DocumentationPlugin` is a separate concrete helper with `toMarkdown()`. `GuaranteedSubflowValidator` is a helper you call directly, not an `AnalysisPlugin` you register.

## Plugin Registry

Use `PluginRegistry` when you want one place to assemble several plugins. Registration alone does not activate them: call analysis, store wrapping, hook installation, and adapter binding at the appropriate points.

This fragment assumes an existing `FlowDefinition<OrderState>` named `definition`. The [tutorial](tutorial-plugins.md) supplies a complete example definition.

```typescript
import { Tramli, InMemoryFlowStore } from '@unlaxer/tramli';
import {
  PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<OrderState>();
const sink = new InMemoryTelemetrySink();
registry
  .register(PolicyLintPlugin.defaults<OrderState>())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

const report = registry.analyzeAll(definition);
console.log(report.asText());
const store = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(store);
registry.installEnginePlugins(engine);
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');
```

Store plugins wrap in registration order: this example gives `EventLogStoreDecorator(AuditingFlowStore(baseStore))`. `analyzeAll()` returns findings; it does not throw on them. To reject `ERROR` findings, use `analyzeAndValidate(definition)` or `buildAndAnalyze(builder)`.

`bindRuntimeAdapters()` returns `Map<string, unknown>`. For a typed adapter, call `new RichResumeRuntimePlugin().bind(engine)` or `new IdempotencyRuntimePlugin(commandRegistry).bind(engine)` directly. Generation helpers run when you call their methods; registering them does not generate output.

## What Plugins May and May Not Do

### MAY

Plugins can wrap storage, install logger callbacks, analyze definitions, generate artifacts, and provide resume APIs. This lets you add audit and monitoring without inserting that code into each Processor.

### MAY NOT

Plugins do not replace the core's build-time checks or bypass `requires` / `produces`. Hierarchy generation still produces flat runtime states; it does not add parallel state regions. Event logs and compensation records do not turn the core into a full event-sourcing or compensation engine.

<a id="v1-plugins"></a>

## Plugins by Task

The following snippets are independent usage fragments. Supply your existing `definition` (or `def`), `engine`, flow ID, and input data where referenced.

### Audit

Use audit logging when you need to inspect the data present at a transition, not just the current state. `AuditStorePlugin` wraps the store and records `flowId`, `from`, `to`, `trigger`, `timestamp`, and `producedDataSnapshot` whenever `recordTransition()` runs.

```typescript
import { AuditStorePlugin } from '@unlaxer/tramli-plugins';

const auditStore = new AuditStorePlugin().wrapStore(new InMemoryFlowStore());
const engine = Tramli.engine(auditStore as any);
const flow = await engine.startFlow(def, 'session-1', initialData);
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('produced:', record.producedDataSnapshot);
}
```

In TypeScript, the snapshot copies the context's map entries; it is not a per-transition diff or a deep copy of the values. The wrapper keeps its audit log in memory, even if the underlying store persists flows. The cast above follows the existing integration tests: `Tramli.engine()` currently accepts the concrete `InMemoryFlowStore` type, so a directly constructed wrapper needs a cast.

<a id="eventstore-lite-tenure-lite"></a>

### Event Log and Replay

Use `EventLogStorePlugin` when you need a versioned transition history, for example to find which state a flow had reached before a problem. The wrapper records transition events with context snapshots and keeps the log in memory.

```typescript
import { EventLogStorePlugin, ReplayService, ProjectionReplayService } from '@unlaxer/tramli-plugins';

const eventStore = new EventLogStorePlugin().wrapStore(rawStore);
const events = eventStore.eventsForFlow(flowId);
const stateAtV3 = new ReplayService().stateAtVersion(eventStore.events(), flowId, 3);
const eventCount = new ProjectionReplayService().stateAtVersion(
  eventStore.events(), flowId, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
```

Run the flow through an engine using `eventStore` before querying it. `ReplayService.stateAtVersion()` returns the `to` state of the latest `TRANSITION` event at or before the requested version, or `null`. It does not restore a `FlowContext` or rerun Processors. `ProjectionReplayService` applies your reducer to matching events in input order, including compensation events; the count above is therefore an event count. For diff-based projections, supply a reducer that applies the diffs.

When you need a record of a compensating action, use `CompensationService`. Its resolver returns an action and metadata; the service appends a `COMPENSATION` event. It does not issue a refund or reverse a transition. The application must implement those actions.

```typescript
import { CompensationService } from '@unlaxer/tramli-plugins';

const compensation = new CompensationService(
  (event, cause) => ({
    action: 'REFUND',
    metadata: { reason: cause.message, originalTransition: event.trigger }
  }),
  eventStore
);
compensation.compensate(failedEvent, error);
```

### Observability

Use this when you need to collect transition, guard, and error events in one place. `ObservabilityEnginePlugin` installs engine logger callbacks and sends events to a `TelemetrySink`. `InMemoryTelemetrySink` lets you inspect them locally.

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine);

for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

Install before running the flow, then read the events afterward. By default, installation replaces existing transition, error, and guard loggers. In TypeScript, `plugin.install(engine, { append: true })` preserves them. Calling a logger setter afterward replaces that logger again.

#### durationMicros (v3.3.0)

To find slow transitions, inspect `durationMicros` on `TransitionLogEntry`, `ErrorLogEntry`, and `GuardLogEntry` (available since v3.3.0). The value is an integer in microseconds; the telemetry plugin includes it in `event.data`. A direct logger can use the existing threshold example below.

```typescript
engine.setTransitionLogger(entry => {
  if (entry.durationMicros > 1000) {
    console.warn(`Slow transition: ${entry.from} → ${entry.to} (${entry.durationMicros}μs)`);
  }
});
```

TypeScript converts `performance.now()` milliseconds with `Math.round((end - start) * 1000)`. Java uses `System.nanoTime()` and divides by 1000; Rust uses `Instant::now()` and `elapsed().as_micros()`.

#### Non-blocking sink pattern

`TelemetrySink.emit()` is synchronous. For HTTP or gRPC output, enqueue events and send them outside that callback. See the [non-blocking sink pattern](patterns/non-blocking-sink.md) for queueing and draining; the in-memory sink does not send events to an external service.

### Rich Resume

Use this when the caller needs a classified result from `resumeAndExecute()`. Pass the state known immediately before the attempt as `previousState`; the TypeScript helper compares it with the returned flow.

```typescript
import { RichResumeExecutor } from '@unlaxer/tramli-plugins';

const executor = new RichResumeExecutor(engine);
const result = await executor.resume(flowId, definition, externalData, previousState);
console.log(result.status, result.flow, result.error);
```

| Status | TypeScript classification |
|--------|---------------------------|
| `TRANSITIONED` | The returned flow's state differs from `previousState`. This can include an error destination. |
| `ALREADY_COMPLETE` | The returned flow is complete without a state change, or the engine throws `FLOW_ALREADY_COMPLETED`. |
| `REJECTED` | The returned flow is incomplete and its state is unchanged. |
| `NO_APPLICABLE_TRANSITION` | The engine throws `FLOW_NOT_FOUND` or `INVALID_TRANSITION`. |
| `EXCEPTION_ROUTED` | Another exception escapes the engine; it is returned in `error`. This status alone does not prove an error-state transition occurred. |

The in-memory store does not load completed flows for update, so a later direct resume can return `NO_APPLICABLE_TRANSITION`. Do not interpret every `ALREADY_COMPLETE` as proof of business success.

### Idempotency

Use this when a webhook or retry can deliver the same command more than once. `IdempotentRichResumeExecutor` records the pair `(flowId, commandId)` before calling Rich Resume and suppresses later attempts with the same pair.

```typescript
import { IdempotentRichResumeExecutor, InMemoryIdempotencyRegistry } from '@unlaxer/tramli-plugins';

const idempotent = new IdempotentRichResumeExecutor(engine, new InMemoryIdempotencyRegistry());
const result = await idempotent.resume(flowId, def,
  { commandId: 'cmd-1', externalData: new Map() }, state);
```

A duplicate returns `ALREADY_COMPLETE` with a duplicate-command error, even if the first attempt was rejected or failed. Reuse the command ID for redelivery of the same event. `InMemoryIdempotencyRegistry` loses its entries on restart. Durable or shared deduplication requires your own `IdempotencyRegistry` implementation; this helper does not make external side effects and command recording atomic.

### Hierarchy Generation

Use this when grouping states as parent and child states makes a definition easier to write. `HierarchyCodeGenerator` generates a flat state configuration and a builder skeleton. `HierarchyGenerationPlugin.generate()` packages them as a map of file names to source strings.

```typescript
import { HierarchyCodeGenerator } from '@unlaxer/tramli-plugins';

const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(hierarchicalSpec));
console.log(gen.generateBuilderSkeleton(hierarchicalSpec));
```

The builder output contains transition comments, not completed Processor implementations or transition declarations. Fill those in and run `build()` validation. `EntryExitCompiler.synthesize()` separately produces entry/exit transition specifications; the code generator does not automatically incorporate that result. Runtime states remain flat.

### Lint / Policy

Use lint when a flow passes structural validation but needs a design review, such as a Processor that produces too many unrelated values. `PolicyLintPlugin.defaults()` runs four warning policies:

| Policy | Warns when |
|--------|------------|
| `terminal-outgoing` | A terminal state has outgoing transitions. |
| `external-count` | A state has more than 3 external transitions. |
| `dead-data` | A produced data key is never consumed. |
| `overwide-processor` | A Processor produces more than 3 data types. |

```typescript
import { PolicyLintPlugin, PluginReport, allDefaultPolicies } from '@unlaxer/tramli-plugins';
import type { FlowPolicy } from '@unlaxer/tramli-plugins';

const customPolicies: FlowPolicy<OrderState>[] = [
  ...allDefaultPolicies<OrderState>(),
  (def, report) => {
    if (def.allStates().length > 20) {
      report.warn('my-policy/too-many-states', 'Consider splitting this flow');
    }
  }
];
const lint = new PolicyLintPlugin(customPolicies);
const report = new PluginReport();
lint.analyze(definition, report);
console.log(report.asText());
```

#### FindingLocation (v3.3.0)

To locate a finding in an editor or report, use its optional `location` (added in v3.3.0). In TypeScript it is a discriminated union, not an enum. `warnAt()` and `errorAt()` attach a location; `warn()` and `error()` remain available without one.

```typescript
type FindingLocation =
  | { type: 'transition'; fromState: string; toState: string }
  | { type: 'state'; state: string }
  | { type: 'data'; dataKey: string }
  | { type: 'flow' };
```

```typescript
report.warnAt('my-policy', 'Too many transitions', { type: 'state', state: 'PENDING' });
```

### Diagram / Docs / Testing

Choose the output for the problem you have:

| Need | Helper | Result |
|------|--------|--------|
| Keep diagrams aligned with the definition | `DiagramPlugin.generate()` | `mermaid`, `dataFlowJson`, `markdownSummary` |
| Share a readable state and transition list | `DocumentationPlugin.toMarkdown()` | Markdown flow catalog |
| List cases to test after a definition changes | `ScenarioTestPlugin.generate()` | `FlowTestPlan` containing scenarios |

These read the definition; they do not execute the business logic.

```typescript
import { DiagramPlugin, DocumentationPlugin, ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

console.log(new DiagramPlugin().generate(definition).mermaid);
console.log(new DocumentationPlugin().toMarkdown(definition));
console.log(new ScenarioTestPlugin().generate(definition).scenarios);
```

The corresponding SPI wrappers are `DiagramGenerationPlugin<S>`, `FlowDocumentationPlugin<S>`, and `ScenarioGenerationPlugin<S>`, each with `generate(definition)`.

#### ScenarioKind (v3.3.0)

Since v3.3.0, scenarios include a `kind`: `happy`, `error`, `guard_rejection`, or `timeout`. Error routes, external guards, and configured transition timeouts determine which extra scenarios are generated. Filter the plan when organizing tests; generated descriptions do not verify Processor behavior.

```typescript
const plan = new ScenarioTestPlugin().generate(definition);
for (const scenario of plan.scenarios) {
  console.log(`[${scenario.kind}] ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
const errorScenarios = plan.scenarios.filter(s => s.kind === 'error');
const guardScenarios = plan.scenarios.filter(s => s.kind === 'guard_rejection');
```

### SubFlow Validation

Use `GuaranteedSubflowValidator` when a child flow declares input data that its parent must supply. It compares the child's data available at entry with data available at the chosen parent state plus `guaranteedTypes`, and throws if keys are missing. Both definitions need a data-flow graph.

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PAYMENT_PENDING', childDef, new Set());
```

`guaranteedTypes` declares additional data the application promises to inject. Validation does not inject that data or start the child flow.
