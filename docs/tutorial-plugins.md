[日本語版](tutorial-plugins-ja.md)

# Plugin Tutorial — A Conversation

*A newcomer (N) sits down with the author (A) to learn tramli's plugin system from scratch.*

---

## Act 1: Why Plugins?

**N:** I just read the README. The core engine has 8 building blocks and a frozen verification kernel. So where do things like auditing and observability go?

**A:** That's exactly what the plugin system solves. The core — FlowState, StateProcessor, TransitionGuard, BranchProcessor, FlowContext, FlowDefinition, FlowEngine, FlowStore — never changes. Plugins layer on top using 6 SPI types.

**N:** SPI?

**A:** Service Provider Interface. Each SPI defines one hook point. You implement the interface, register it, done.

---

## Act 2: The 6 SPI Types

**N:** What are the 6?

**A:** Let's go through them:

1. **AnalysisPlugin** — Runs static analysis against a `FlowDefinition`. Think of it as lint for your state machine.
2. **StorePlugin** — Wraps a `FlowStore` with a decorator. The Audit and EventLog plugins use this.
3. **EnginePlugin** — Installs hooks on `FlowEngine` (e.g., loggers for observability).
4. **RuntimeAdapterPlugin** — Binds an engine to a richer API. RichResume and Idempotency use this.
5. **GenerationPlugin** — Takes input, produces output. Diagram, Hierarchy, and Scenario plugins use this.
6. **DocumentationPlugin** — A specialization of GenerationPlugin that returns a string.

**N:** And PluginRegistry ties them all together?

**A:** Yes. You register plugins, then call lifecycle methods in order:

```typescript
import { PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<OrderState>();
const sink = new InMemoryTelemetrySink();

registry
  .register(PolicyLintPlugin.defaults())           // Analysis
  .register(new AuditStorePlugin())                // Store
  .register(new EventLogStorePlugin())             // Store
  .register(new ObservabilityEnginePlugin(sink));   // Engine

// 1. Lint your definition
const report = registry.analyzeAll(definition);
console.log(report.asText());

// 2. Wrap the store
const store = new InMemoryFlowStore();
const wrappedStore = registry.applyStorePlugins(store);

// 3. Create engine with wrapped store, install hooks
const engine = Tramli.engine(wrappedStore);
registry.installEnginePlugins(engine);

// 4. Bind runtime adapters
const adapters = registry.bindRuntimeAdapters(engine);
```

---

## Act 3: Audit — "What happened?"

**N:** Let's start with something concrete. How does auditing work?

**A:** `AuditStorePlugin` wraps your FlowStore. Every time `recordTransition` is called, the wrapper captures a snapshot of the produced data alongside the transition metadata.

```typescript
import { AuditStorePlugin, AuditingFlowStore } from '@unlaxer/tramli-plugins';

const rawStore = new InMemoryFlowStore();
const auditStore = new AuditStorePlugin().wrapStore(rawStore);
const engine = Tramli.engine(auditStore);

// Run your flow...
const flow = await engine.startFlow(def, 'session-1', initialData);

// Inspect audit log
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('  produced:', record.producedDataSnapshot);
}
```

**N:** So it's non-invasive? My processors don't know about auditing?

**A:** Exactly. Decorator pattern. Zero coupling.

---

## Act 4: Event Store — Replay and Compensation

**N:** What about event sourcing?

**A:** We have "Tenure-lite" — intentionally lighter than full event sourcing. `EventLogStorePlugin` wraps the store and appends versioned events.

```typescript
import { EventLogStorePlugin, EventLogStoreDecorator,
  ReplayService, ProjectionReplayService, CompensationService
} from '@unlaxer/tramli-plugins';

const eventStore = new EventLogStorePlugin().wrapStore(rawStore);
const engine = Tramli.engine(eventStore);

// After running flows, query the event log:
const events = eventStore.eventsForFlow(flowId);
```

**N:** And replay?

**A:** `ReplayService` reconstructs the state at any version:

```typescript
const replay = new ReplayService();
const stateAtV3 = replay.stateAtVersion(eventStore.events(), flowId, 3);
// → 'CONFIRMED'
```

For custom aggregations, use `ProjectionReplayService` with a reducer:

```typescript
const projection = new ProjectionReplayService();
const transitionCount = projection.stateAtVersion(
  eventStore.events(), flowId, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
```

**N:** What about compensation — saga patterns?

**A:** `CompensationService` takes a resolver function and records compensation events:

```typescript
const compensation = new CompensationService(
  (event, cause) => ({
    action: 'REFUND',
    metadata: { reason: cause.message, originalTransition: event.trigger }
  }),
  eventStore
);

// When a transition fails:
compensation.compensate(failedEvent, error);
// → appends a COMPENSATION event to the log
```

---

## Act 5: Rich Resume and Idempotency

**N:** The core `resumeAndExecute` just returns a flow. How do I tell if it actually transitioned?

**A:** That's what `RichResumeExecutor` does. It classifies the outcome:

```typescript
import { RichResumeExecutor } from '@unlaxer/tramli-plugins';

const executor = new RichResumeExecutor(engine);
const result = await executor.resume(flowId, definition, externalData, previousState);

switch (result.status) {
  case 'TRANSITIONED':        // moved to a new state
  case 'ALREADY_COMPLETE':    // flow was already done
  case 'REJECTED':            // guard rejected, no transition
  case 'NO_APPLICABLE_TRANSITION': // no matching transition found
  case 'EXCEPTION_ROUTED':    // error routed to error state
}
```

**N:** And idempotency?

**A:** `IdempotentRichResumeExecutor` wraps RichResume with a command registry:

```typescript
import { InMemoryIdempotencyRegistry, IdempotentRichResumeExecutor } from '@unlaxer/tramli-plugins';

const registry = new InMemoryIdempotencyRegistry();
const executor = new IdempotentRichResumeExecutor(engine, registry);

// First call processes normally
const r1 = await executor.resume(flowId, definition,
  { commandId: 'cmd-abc', externalData: new Map() }, previousState);
// r1.status === 'TRANSITIONED'

// Duplicate call is suppressed
const r2 = await executor.resume(flowId, definition,
  { commandId: 'cmd-abc', externalData: new Map() }, previousState);
// r2.status === 'ALREADY_COMPLETE'
```

**N:** So I just need a unique commandId per user action?

**A:** That's it. The `InMemoryIdempotencyRegistry` is for testing. In production, back it with Redis or a database.

---

## Act 6: Observability

**N:** How do I monitor flows in production?

**A:** `ObservabilityEnginePlugin` installs logger hooks on the engine. Events flow into a `TelemetrySink`:

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine);

// After flow execution:
for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

**N:** Can I pipe events to Prometheus or Datadog?

**A:** Implement the `TelemetrySink` interface and emit metrics from `emit()`. The `InMemoryTelemetrySink` is just for testing.

**N:** Won't `emit()` block under high load?

**A:** `emit()` is intentionally sync (DD-012/DD-013). For HTTP/gRPC sinks, use the channel pattern — send to a channel inside `emit()`, drain on a separate thread. It's 5 lines of code. See [`docs/patterns/non-blocking-sink.md`](patterns/non-blocking-sink.md).

**N:** I heard v3.3.0 added `durationMicros`?

**A:** Yes. `TransitionLogEntry`, `ErrorLogEntry`, and `GuardLogEntry` now include `durationMicros` (integer microseconds). Great for spotting bottlenecks:

```typescript
engine.setTransitionLogger(entry => {
  if (entry.durationMicros > 1000) { // over 1ms
    console.warn(`Slow transition: ${entry.from} → ${entry.to} (${entry.durationMicros}μs)`);
  }
});
```

---

## Act 7: Lint Policies

**N:** You mentioned lint earlier. What does it check?

**A:** `PolicyLintPlugin` runs 4 default policies:

1. **terminal-outgoing** — Terminal states shouldn't have outgoing transitions
2. **external-count** — Warns if a state has more than 3 external transitions
3. **dead-data** — Types that are produced but never consumed
4. **overwide-processor** — Processors that produce more than 3 types

```typescript
import { PolicyLintPlugin, PluginReport } from '@unlaxer/tramli-plugins';

const lint = PolicyLintPlugin.defaults();
const report = new PluginReport();
lint.analyze(definition, report);

for (const finding of report.findings()) {
  console.warn(`[${finding.severity}] ${finding.pluginId}: ${finding.message}`);
}
```

**N:** v3.3.0 added `location` to Finding. How does that work?

**A:** `FindingLocation` is a discriminated union with 4 variants: `Transition(from, to)`, `State(state)`, `Data(dataKey)`, `Flow`. Lint results now tell you exactly where the issue is:

```typescript
for (const finding of report.findings()) {
  if (finding.location?.type === 'transition') {
    console.warn(`${finding.message} @ ${finding.location.fromState} → ${finding.location.toState}`);
  }
}
```

Custom policies can use `warnAt()` to attach location:

```typescript
report.warnAt('my-policy', 'Too many transitions', { type: 'state', state: 'PENDING' });
```

**N:** Can I add custom policies?

**A:** Yes. A policy is just a function `(definition, report) => void`:

```typescript
const customPolicies = [
  ...allDefaultPolicies(),
  (def, report) => {
    if (def.allStates().length > 20) {
      report.warn('my-policy/too-many-states', 'Consider splitting this flow');
    }
  }
];
const lint = new PolicyLintPlugin(customPolicies);
```

---

## Act 8: Generation Plugins

### Diagrams

**N:** I know tramli generates Mermaid diagrams. What does the plugin add?

**A:** `DiagramGenerationPlugin` bundles three outputs at once:

```typescript
import { DiagramPlugin } from '@unlaxer/tramli-plugins';

const bundle = new DiagramPlugin().generate(definition);
// bundle.mermaid         → Mermaid stateDiagram-v2
// bundle.dataFlowJson    → JSON data-flow graph
// bundle.markdownSummary → Quick stats
```

### Hierarchy

**N:** What's the Hierarchy plugin for?

**A:** It lets you author state hierarchies (parent/child) and flatten them into tramli's flat enum model:

```typescript
import { flowSpec, stateSpec, transitionSpec,
  EntryExitCompiler, HierarchyCodeGenerator } from '@unlaxer/tramli-plugins';

const spec = flowSpec('Order', 'OrderState');
const processing = stateSpec('PROCESSING', { initial: true });
processing.entryProduces.push('AuditLog');
processing.children.push(stateSpec('VALIDATING'));
processing.children.push(stateSpec('CONFIRMING'));
spec.rootStates.push(processing);
spec.rootStates.push(stateSpec('DONE', { terminal: true }));
spec.transitions.push(transitionSpec('PROCESSING', 'DONE', 'complete'));

// Synthesize entry/exit transitions
const entryExit = new EntryExitCompiler().synthesize(spec);

// Generate TypeScript source
const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(spec));
console.log(gen.generateBuilderSkeleton(spec));
```

### Test Scenarios

**N:** BDD from a flow definition?

**A:** `ScenarioTestPlugin` generates scenarios from your flow definition. Since v3.3.0 it also generates error paths, guard rejections, and timeout scenarios. Each scenario has a `kind` field (`happy`, `error`, `guard_rejection`, `timeout`):

```typescript
import { ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

const plan = new ScenarioTestPlugin().generate(definition);
for (const scenario of plan.scenarios) {
  console.log(`Scenario: ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
// Output:
//   Scenario: CREATED_to_PENDING
//     given flow in CREATED
//     when auto processor OrderInit runs
//     then flow reaches PENDING
```

---

## Act 9: Documentation

**N:** And documentation generation?

**A:** `DocumentationPlugin` generates a markdown flow catalog:

```typescript
import { DocumentationPlugin } from '@unlaxer/tramli-plugins';

const md = new DocumentationPlugin().toMarkdown(definition);
console.log(md);
// # Flow Catalog: order
//
// ## States
// - `CREATED` (initial)
// - `PAYMENT_PENDING`
// - `PAYMENT_CONFIRMED`
// - `SHIPPED` (terminal)
// - `CANCELLED` (terminal)
//
// ## Transitions
// - `CREATED -> PAYMENT_PENDING` via `OrderInit`
// ...
```

---

## Act 10: SubFlow Validation

**N:** One last thing — I'm using subflows. How do I make sure the child flow gets the data it needs?

**A:** `GuaranteedSubflowValidator` checks at design time:

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PAYMENT_PENDING', childDef, new Set());
// Throws if childDef's entry requires types not available at PAYMENT_PENDING
```

You can pass `guaranteedTypes` for data the parent will inject at runtime.

---

## Act 11: Putting It All Together

**N:** OK, let me write it all in one flow.

**A:** Here's the full integration pattern:

```typescript
import { Tramli, InMemoryFlowStore, flowKey } from '@unlaxer/tramli';
import {
  PluginRegistry, PolicyLintPlugin,
  AuditStorePlugin, EventLogStorePlugin,
  ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
  DiagramPlugin, DocumentationPlugin, ScenarioTestPlugin,
} from '@unlaxer/tramli-plugins';

// 1. Define your flow (core tramli)
const def = Tramli.define<OrderState>('order', stateConfig)
  .initiallyAvailable(OrderRequest)
  .from('CREATED').auto('PAYMENT_PENDING', orderInit)
  .from('PAYMENT_PENDING').external('PAYMENT_CONFIRMED', paymentGuard)
  .from('PAYMENT_CONFIRMED').auto('SHIPPED', ship)
  .onAnyError('CANCELLED')
  .build();

// 2. Register plugins
const sink = new InMemoryTelemetrySink();
const registry = new PluginRegistry<OrderState>();
registry
  .register(PolicyLintPlugin.defaults())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

// 3. Lint
const report = registry.analyzeAll(def);
if (report.findings().length > 0) console.warn(report.asText());

// 4. Build engine with wrapped store
const wrappedStore = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(wrappedStore);
registry.installEnginePlugins(engine);

// 5. Get rich APIs
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');

// 6. Generate docs
console.log(new DiagramPlugin().generate(def).mermaid);
console.log(new DocumentationPlugin().toMarkdown(def));
console.log(new ScenarioTestPlugin().generate(def).scenarios);

// 7. Run!
const flow = await engine.startFlow(def, 'session-1', initialData);
```

**N:** That's... incredibly clean. The core is 50 lines, the plugins are optional layers, and the flow definition is still the single source of truth.

**A:** That's the idea. tramli = rails. Plugins = stations along the track.
