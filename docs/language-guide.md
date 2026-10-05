[日本語版](language-guide-ja.md)

# Language Guide — Java / TypeScript / Rust

This guide is for engineers choosing a tramli implementation or moving a flow between languages.
Choose the implementation that matches your application: the flow model and eight `build()` checks are shared; API syntax, data keys, and async integration differ.
The tables and examples below explain those differences before you write a processor.

## Which language should I use?

| Your stack | Use | How to handle I/O |
|-----------|-----|------------------|
| Java / Kotlin / Spring | [Java implementation](../lang/java/) (Java 21+) | Call the synchronous engine; use virtual threads or `CompletableFuture` in the caller when needed. |
| Node.js / Deno / Bun | [TypeScript implementation](../lang/ts/) | Use `await` for engine calls. Keep Auto processors synchronous; use async I/O outside the engine or at External transitions. |
| Rust / systems programming | [Rust implementation](../lang/rust/) | Call the synchronous engine from your application; use `await` for I/O outside it. |
| Multi-language services | Choose per service | Keep the same flow structure and data contracts; adapt the API calls to each language. |

## Core Principle

An order flow may prepare a payment request, wait for a payment response, then prepare a shipment. If the payment HTTP call is mixed into the preparation step, that step also has to handle network delays and failures. Moving the flow to another language then means rewriting both the decision logic and the I/O integration.

tramli separates these concerns with three kinds of transition:

- **Auto** advances without an outside event.
- **External** waits until the application resumes the flow with outside data.
- **Branch** selects a destination from declared alternatives.

Each language uses a flat set of states. A processor is the application code run by a transition; it declares the data it reads (`requires`) and writes (`produces`). Calling `build()` checks eight structural rules, including whether required data is available on every path. The compiler checks language types; `build()` checks the flow definition when that method runs.

The recommended I/O pattern is the same in all three languages: run to an External wait, perform I/O in the caller, and resume with the result. TypeScript also supports async callbacks, as explained below. See the [async integration guide](async-integration.md) for the complete sequence.

## Async Strategy per Language

Here, **synchronous** means the call returns a value or throws before the caller continues. **Asynchronous** means the caller waits for completion through a `Promise` or an async runtime. A synchronous method can still block if you put I/O inside it.

### Java: Sync only

The engine and processor callbacks are synchronous. Keep HTTP calls and database queries in the calling application, then pass their results when resuming the flow. Java 21 virtual threads let the caller use blocking I/O APIs; `CompletableFuture` is another caller-side option.

These are call fragments: `definition`, `initialData`, `flowId`, and `data` are supplied by the application.

```java
engine.startFlow(definition, null, initialData);      // sync, ~1μs
engine.resumeAndExecute(flowId, definition, data);    // sync, ~300ns
```

The timings shown here (~1μs to start, ~300ns to resume) are the guide's approximate engine-only figures, not a latency guarantee. They exclude your processors, storage, and I/O.

### TypeScript: Sync + optional async

Engine calls return `Promise<FlowInstance>` and must be awaited, even when every processor is synchronous. A `StateProcessor` declares `name`, `requires`, and `produces` as properties; `process` may return `void` or `Promise<void>`.

Keep Auto processors synchronous so a chain of automatic transitions only does local work. This existing [order-flow example](../lang/ts/tests/order-flow.test.ts) reads an order request and writes a payment intent without contacting a payment service. `OrderRequest` and `PaymentIntent` are typed data keys defined in that example.

```typescript
const orderInit: StateProcessor<OrderState> = {
  name: 'OrderInit',
  requires: [OrderRequest],
  produces: [PaymentIntent],
  process(ctx: FlowContext) {
    const req = ctx.get(OrderRequest);
    ctx.put(PaymentIntent, { transactionId: `txn-${req.itemId}` });
  },
};
```

For I/O inside an External transition, use an async `process` on the same `StateProcessor` interface. There is no separate async processor type. See the [External processor example](async-integration.md#why-typescript-has-optional-async--and-javarust-dont).

The design rule is to keep Auto processors and Branch decisions synchronous and reserve async callbacks for External transitions. This is a usage rule, not a type-system restriction: the current TypeScript interfaces also accept promises for those callbacks, and the engine awaits them. See the [callback types](../lang/ts/src/types.ts) and [engine implementation](../lang/ts/src/flow-engine.ts).

### Rust: Sync only

The engine and processor traits are synchronous. An async HTTP handler or task can call them before and after awaiting I/O; the engine does not require an async runtime.

This fragment comes from the [Rust quick start](../lang/rust/README.md#quick-start). `def` is an `Arc<FlowDefinition<OrderState>>`. The empty vectors are appropriate for that example because its guard needs no external data.

```rust
let mut engine = FlowEngine::new(InMemoryFlowStore::new());
let flow_id = engine.start_flow(def, "session-1", vec![]).unwrap();

engine.resume_and_execute(&flow_id, vec![]).unwrap();
```

`start_flow` returns a flow ID in a `Result`; `resume_and_execute` takes that ID and external data, and returns `Result<(), FlowError>`. The definition is already stored with the flow, so resuming does not take it again. See the [async integration guide](async-integration.md#how-to-use-with-async-runtimes) for passing an I/O result.

## Sync vs. Async — Summary Table

This table describes the recommended callback usage. Java and Rust enforce synchronous callback signatures. TypeScript's signatures are broader, as noted above.

| Callback | Java | Rust | TypeScript |
|---|---|---|---|
| `StateProcessor.process` | sync | sync | sync for Auto; sync or async `Promise<void>` for External |
| `TransitionGuard.validate` | sync | sync | sync or async `Promise<GuardOutput>` for External |
| `BranchProcessor.decide` | sync | sync | sync recommended |
| `FlowEngine.startFlow` / Rust `start_flow` | sync | sync | async (`Promise<FlowInstance>`) |
| `FlowEngine.resumeAndExecute` / Rust `resume_and_execute` | sync | sync | async (`Promise<FlowInstance>`) |

The design policy is also described in [the specification, §1.3a](../spec/SPEC.md#13a-sync-vs-async--per-language-processor-support).

## API Comparison

The concepts are shared, but the calls are language-specific. `S` below denotes your state type; `stateConfig` is TypeScript's record of initial and terminal state flags. A guard accepts, rejects, or expires an External event; `FlowContext` holds data passed between steps.

| Concept | Java | TypeScript | Rust |
|---------|------|------------|------|
| States | `enum S implements FlowState` | string union `S` + `Record<S, StateConfig>` | `enum S` + `FlowState` trait |
| Processor | `interface StateProcessor` | `StateProcessor<S>` object | `trait StateProcessor<S>` |
| Guard output | `sealed interface GuardOutput` | discriminated union | `enum GuardOutput` |
| Flow context keys | `Class<T>` | `FlowKey<T>` (branded string) | `TypeId` |
| Definition | `Tramli.define("name", S.class)` | `Tramli.define("name", stateConfig)` | `Builder::<S>::new("name")` |
| Build validation | `build()` throws `FlowException` | `build()` throws `FlowError` | `build()` returns `Result` |
| Mermaid state diagram | `MermaidGenerator.generate(def)` | `MermaidGenerator.generate(def)` | `MermaidGenerator::generate(&def)` |
| Data-flow Mermaid | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator::generate_data_flow(&def)` |
| DataFlowGraph | `def.dataFlowGraph()` | `def.dataFlowGraph` | `def.data_flow_graph()` |
| SubFlow | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.sub_flow(runner).on_exit("X", S).end_sub_flow()` |
| Explicit External trigger | `.externalOn(Event.class, to, guard)` | `.externalOn(Event, to, guard)` | `.external_on::<Event>(to, guard)` |
| State path | `flow.statePathString()` | `flow.statePathString()` | `flow.state_path_string()` |
| Waiting for | `flow.waitingFor()` | `flow.waitingFor()` | `flow.waiting_for()` |
| Entry point | `Tramli.define()` | `Tramli.define()` | `Builder::new()` |

## Type Safety Comparison

There are two separate checks: the language checks types during compilation, and tramli checks the flow when `build()` runs. A flow can compile and still fail `build()` because, for example, one branch never produces data needed later.

| Feature | Java | TypeScript | Rust |
|---------|------|------------|------|
| State exhaustiveness | enum; checks depend on the switch form | string union; use an explicit exhaustiveness check | enum; `match` must cover all cases |
| Guard output | sealed interface | discriminated union | enum with exhaustive matching |
| Context type safety | `Class<T>` key gives a typed return | `FlowKey<T>` gives a typed return; stored values are asserted, not runtime-validated | `TypeId` lookup and checked downcast |
| Build errors | `FlowException` when `build()` runs | `FlowError` when `build()` runs | `Err(FlowError)` when `build()` runs |

For the language features considered when evaluating a new port, see the [language compatibility matrix](language-compatibility-matrix.md). For version compatibility of public APIs, see [API stability tiers](api-stability.md).

## File Structure

Implementations live under `lang/`. Shared scenarios describe the same flows for tests in all three languages.

```text
tramli/
├── lang/
│   ├── java/
│   │   ├── pom.xml
│   │   └── src/main/java/org/unlaxer/tramli/
│   │       ├── Tramli.java
│   │       ├── FlowDefinition.java
│   │       └── FlowEngine.java
│   ├── ts/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── flow-definition.ts
│   │       └── flow-engine.ts
│   └── rust/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── definition.rs
│           └── engine.rs
├── shared-tests/scenarios/
│   └── order-happy-path.yaml
└── docs/
    ├── async-integration.md
    ├── language-guide.md
    └── language-guide-ja.md
```
