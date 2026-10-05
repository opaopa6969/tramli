[日本語版](tutorial-plugins-ja.md)

<a id="plugin-tutorial--a-conversation"></a>

# Plugin Tutorial

This tutorial is for engineers trying tramli plugins for the first time. You will run a small flow, inspect its history, and send the same external command twice.
For plugin selection, API details, and limits, use the [Plugin Guide](plugin-guide.md).
Steps 1–8 form one TypeScript example; steps 9–11 show optional extensions and an alternative way to assemble plugins.

<a id="act-1-why-plugins"></a>

## 1. Prepare a Flow That Waits for an Event

Suppose you can see a request's current state but cannot tell how it got there. You also need to handle redelivery of the event that lets it proceed. We will add logging and duplicate suppression around the engine, leaving the Processors responsible for their own transitions.

Use a TypeScript project with Node.js 20 or later, TypeScript, `@unlaxer/tramli`, and `@unlaxer/tramli-plugins` installed. These examples follow the repository's `main`; check that your installed versions expose the APIs used here.

Create `plugins.mts`. Copy the TypeScript blocks in steps 1–8 into that file in order. The flow below comes from the existing [plugin integration tests](../lang/ts-plugins/tests/plugin-integration.test.ts): `CREATED → PENDING` runs automatically, `PENDING → CONFIRMED` waits for an external call, and `CONFIRMED → DONE` runs automatically. `ERROR` is the error destination. The guard accepts in this exercise so we can focus on the plugins.

```typescript
import { Tramli, InMemoryFlowStore, flowKey } from '@unlaxer/tramli';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput, FlowContext } from '@unlaxer/tramli';

type S = 'CREATED' | 'PENDING' | 'CONFIRMED' | 'DONE' | 'ERROR';

const config: Record<S, StateConfig> = {
  CREATED:   { terminal: false, initial: true },
  PENDING:   { terminal: false },
  CONFIRMED: { terminal: false },
  DONE:      { terminal: true },
  ERROR:     { terminal: true },
};

interface Input { value: string }
interface Middle { processed: boolean }
interface Output { result: string }

const InputKey = flowKey<Input>('Input');
const MiddleKey = flowKey<Middle>('Middle');
const OutputKey = flowKey<Output>('Output');

const proc1: StateProcessor<S> = {
  name: 'Proc1',
  requires: [InputKey],
  produces: [MiddleKey],
  process(ctx: FlowContext) {
    const input = ctx.get(InputKey);
    ctx.put(MiddleKey, { processed: true });
  },
};

const proc2: StateProcessor<S> = {
  name: 'Proc2',
  requires: [MiddleKey],
  produces: [OutputKey],
  process(ctx: FlowContext) {
    ctx.put(OutputKey, { result: 'done' });
  },
};

function testGuard(accept: boolean): TransitionGuard<S> {
  return {
    name: 'TestGuard',
    requires: [MiddleKey],
    produces: [],
    maxRetries: 3,
    validate(_ctx: FlowContext): GuardOutput {
      return accept
        ? { type: 'accepted' }
        : { type: 'rejected', reason: 'declined' };
    },
  };
}

function buildDef(accept = true) {
  return Tramli.define<S>('test', config)
    .setTtl(5 * 60 * 1000)
    .initiallyAvailable(InputKey)
    .from('CREATED').auto('PENDING', proc1)
    .from('PENDING').external('CONFIRMED', testGuard(accept))
    .from('CONFIRMED').auto('DONE', proc2)
    .onAnyError('ERROR')
    .build();
}

const def = buildDef(true);
```

<a id="act-7-lint-policies"></a>

## 2. Check the Definition with Lint

A structurally valid flow can still contain unused data or a Processor with too many outputs. Run `PolicyLintPlugin` after `build()` to find those review points.

```typescript
import { PolicyLintPlugin, PluginReport } from '@unlaxer/tramli-plugins';

const lint = PolicyLintPlugin.defaults<S>();
const report = new PluginReport();
lint.analyze(def, report);
console.log(report.asText());
for (const finding of report.findings()) {
  if (finding.location?.type === 'transition') {
    console.warn(`${finding.message} @ ${finding.location.fromState} → ${finding.location.toState}`);
  }
}
```

Expect a `policy/dead-data` warning for `Output`: `Proc2` produces it, but no later step reads it. That is a review prompt, not a build failure. The [guide](plugin-guide.md#lint--policy) lists all four default policies, their thresholds, and how to add a custom policy or a finding location.

<a id="act-3-audit--what-happened"></a>

## 3. Add Audit and Event Logs to the Store

To inspect data at each transition, use `AuditStorePlugin`. To query the sequence of transitions by version, add `EventLogStorePlugin`. Wrap the store before creating the engine, and keep references to both wrappers so you can read their logs later.

```typescript
import { AuditStorePlugin, EventLogStorePlugin } from '@unlaxer/tramli-plugins';

const rawStore = new InMemoryFlowStore();
const auditStore = new AuditStorePlugin().wrapStore(rawStore);
const eventStore = new EventLogStorePlugin().wrapStore(auditStore);
const engine = Tramli.engine(eventStore as any);
```

The cast follows the integration tests: the current TypeScript `Tramli.engine()` parameter is the concrete `InMemoryFlowStore` type. Both wrappers provide the methods used by the engine. Their logs are in memory; wrapping a persistent store would not itself persist these logs.

<a id="act-6-observability"></a>

## 4. Collect Execution Telemetry

To see which guard ran or which transition was slow, install `ObservabilityEnginePlugin` before execution. This example also retains a direct logger that warns on transitions over 1000 microseconds (1 ms).

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

engine.setTransitionLogger(entry => {
  if (entry.durationMicros > 1000) {
    console.warn(`Slow transition: ${entry.from} → ${entry.to} (${entry.durationMicros}μs)`);
  }
});
const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine, { append: true });
```

`append: true` preserves the existing logger; default installation replaces it. Transition, error, and guard log entries expose integer `durationMicros` values. For remote output, implement `TelemetrySink` and keep its synchronous `emit()` short by queueing work; see the [non-blocking sink pattern](patterns/non-blocking-sink.md).

## 5. Start the Flow and Inspect the First Transition

Start with the input required by `Proc1`. The engine runs that Processor and stops at `PENDING`, waiting for an external call. Inspect the audit record to see the context at that point.

```typescript
const flow = await engine.startFlow(def, 's1',
  new Map([[InputKey as string, { value: 'test' }]]));
console.log(flow.currentState);
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('produced:', record.producedDataSnapshot);
}
```

Expect `PENDING` and a `CREATED → PENDING` audit entry. Despite its field name, `producedDataSnapshot` contains all context map entries at recording time, including `Input` and `Middle`; it is not just the data produced by that transition.

<a id="act-5-rich-resume-and-idempotency"></a>

## 6. Resume with Duplicate Suppression

An event sender can retry after losing a response. Use the same command ID for redelivery so the second attempt does not execute the flow again. `IdempotentRichResumeExecutor` uses Rich Resume's result classification and adds command tracking.

```typescript
import { InMemoryIdempotencyRegistry, IdempotentRichResumeExecutor } from '@unlaxer/tramli-plugins';

const commandRegistry = new InMemoryIdempotencyRegistry();
const executor = new IdempotentRichResumeExecutor(engine, commandRegistry);
const previousState = flow.currentState;
const r1 = await executor.resume(flow.id, def,
  { commandId: 'cmd-1', externalData: new Map() }, previousState);
console.log(r1.status, r1.flow?.currentState);
const r2 = await executor.resume(flow.id, def,
  { commandId: 'cmd-1', externalData: new Map() }, previousState);
console.log(r2.status, r2.error?.message);
```

Expect `TRANSITIONED DONE`, followed by `ALREADY_COMPLETE` and `duplicate commandId cmd-1`. The empty external-data map is sufficient here because the exercise guard reads `Middle` from the existing context. In an application, supply the data your external transition needs.

Without duplicate suppression, use `new RichResumeExecutor(engine).resume(flowId, definition, externalData, previousState)`. The [guide's status table](plugin-guide.md#rich-resume) explains all five results. Here, `ALREADY_COMPLETE` means the command was already seen. The ID is recorded before execution, even if the attempt is rejected or fails; this is not proof that the business operation succeeded. The in-memory registry also loses its records on restart.

<a id="act-4-event-store--replay-and-compensation"></a>

## 7. Read the History and Telemetry

To check where the flow was at a particular version, query the event log after execution. `ReplayService` returns a state name. For your own aggregations, pass a reducer to `ProjectionReplayService`.

```typescript
import { ReplayService, ProjectionReplayService } from '@unlaxer/tramli-plugins';

const events = eventStore.eventsForFlow(flow.id);
console.log(events.map(event => [event.version, event.from, event.to]));
const stateAtV3 = new ReplayService().stateAtVersion(eventStore.events(), flow.id, 3);
console.log(stateAtV3);
const eventCount = new ProjectionReplayService().stateAtVersion(
  eventStore.events(), flow.id, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
console.log(eventCount);
for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

Expect three transition events: version 1 to `PENDING`, version 2 to `CONFIRMED`, and version 3 to `DONE`. `stateAtV3` is `DONE` and the event count is 3. Duplicate suppression adds no transition. The telemetry sink includes transition events and the guard result.

Replay does not rerun Processors or restore their data. If you need to record an action such as a refund after a failure, [CompensationService](plugin-guide.md#event-log-and-replay) appends a compensation event using your resolver. It does not perform the refund. The reducer above counts those events too if they are present.

<a id="act-8-generation-plugins"></a>

## 8. Generate Diagrams, Documentation, and Test Plans

### Diagrams

To keep a diagram aligned with the flow definition, generate it with `DiagramPlugin`. The bundle also includes a data-flow graph as JSON and a Markdown summary.

```typescript
import { DiagramPlugin } from '@unlaxer/tramli-plugins';

const bundle = new DiagramPlugin().generate(def);
console.log(bundle.mermaid);
console.log(bundle.dataFlowJson);
console.log(bundle.markdownSummary);
```

<a id="act-9-documentation"></a>

### Documentation

To share a readable list of states and transitions, use `DocumentationPlugin`. For this flow the Markdown starts with `# Flow Catalog: test` and lists the states and transitions defined in step 1.

```typescript
import { DocumentationPlugin } from '@unlaxer/tramli-plugins';

const md = new DocumentationPlugin().toMarkdown(def);
console.log(md);
```

### Test Scenarios

To review which cases need tests, generate a plan with `ScenarioTestPlugin`. Each scenario describes its starting state, trigger, and expected destination. Its `kind` is `happy`, `error`, `guard_rejection`, or `timeout`, depending on the definition.

```typescript
import { ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

const plan = new ScenarioTestPlugin().generate(def);
for (const scenario of plan.scenarios) {
  console.log(`[${scenario.kind}] ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
```

Expect happy-path, error, and guard-rejection scenarios. This definition has a flow TTL but no per-transition timeout, so it produces no `timeout` scenario. `generate()` returns descriptions; you still need tests of Processor behavior.

Run the completed file from your project:

```bash
npx tsc plugins.mts --target ES2022 --module NodeNext --strict --skipLibCheck
node plugins.mjs
```

<a id="hierarchy"></a>

## 9. Optional: Generate a Flat Definition from a Hierarchy

When related states are easier to describe as a parent and its children, use the hierarchy helpers. This independent example describes `PROCESSING` with `VALIDATING` and `CONFIRMING` children, then prints source text.

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

const entryExit = new EntryExitCompiler().synthesize(spec);
console.log(entryExit);
const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(spec));
console.log(gen.generateBuilderSkeleton(spec));
```

The state configuration is flat. The builder contains comments for the transitions; fill in the actual transition declarations and Processors, then call `build()` to validate them. The entry/exit specifications are a separate output, not automatically inserted into the generated builder. This does not add hierarchical runtime states.

<a id="act-10-subflow-validation"></a>

## 10. Optional: Check a Child Flow's Inputs

When a parent starts a child flow, check that the child can receive the data it declares at entry. `GuaranteedSubflowValidator` compares the two definitions. This example from the integration tests uses a child with no input requirements, so validation passes. You can append it to the exercise file.

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const parentDef = buildDef(true);
const subConfig: Record<'SUB_A' | 'SUB_B', StateConfig> = {
  SUB_A: { terminal: false, initial: true },
  SUB_B: { terminal: true },
};
const subDef = Tramli.define<'SUB_A' | 'SUB_B'>('sub', subConfig)
  .from('SUB_A').auto('SUB_B', {
    name: 'SubProc', requires: [], produces: [],
    process() {},
  })
  .build();
const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PENDING', subDef, new Set());
```

With real child inputs, missing keys cause an exception. The fourth argument, `guaranteedTypes`, can declare extra keys the application will inject at runtime. This call verifies the declaration; it does not inject data or launch the child.

<a id="act-2-the-6-spi-types"></a>

<a id="act-11-putting-it-all-together"></a>

## 11. Alternative: Assemble Plugins with a Registry

As the plugin list grows, `PluginRegistry` gives you one place to configure it. It calls plugins through SPI interfaces, each defining where a plugin attaches; the [guide](plugin-guide.md#plugin-types-spi) lists the six interfaces.

The following is an alternative to the manual wiring in steps 2–4 and 6. Use it with the definition from step 1 in a separate file, rather than appending it to the already configured engine.

```typescript
import {
  PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<S>();
const sink = new InMemoryTelemetrySink();
registry
  .register(PolicyLintPlugin.defaults<S>())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

const report = registry.analyzeAll(def);
console.log(report.asText());
const store = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(store);
registry.installEnginePlugins(engine);
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');
```

Inspect `report`, then start a flow with `engine` as in step 5. The runtime-adapter map stores values as `unknown`; the [guide](plugin-guide.md#plugin-registry) shows how to bind typed adapters directly. Generate diagrams and documentation by calling the helpers from step 8. Registration alone does not run analysis, install hooks, or generate output.
