[日本語版](language-guide-ja.md)

# Language Guide — Java / TypeScript / Rust

tramli has three implementations. The **design is identical**. The **async strategy differs by language**.

## Core Principle

> **The SM engine is a judgment machine, not an I/O machine.**
> It decides "what state comes next" in microseconds.
> I/O (HTTP calls, DB queries) happens outside the engine.

This principle holds across all three languages. The difference is **how** each language handles async I/O at the boundary.

---

## Async Strategy per Language

### Java: Sync only

```java
// Everything is sync. Use virtual threads for I/O if needed.
engine.startFlow(definition, null, initialData);      // sync, ~1μs
engine.resumeAndExecute(flowId, definition, data);    // sync, ~300ns

// If you need async I/O between resume calls:
var result = CompletableFuture.supplyAsync(() -> httpClient.send(req));
```

**Why sync?** Java 21 has virtual threads. `Thread.startVirtualThread(() -> blockingIO())` is simpler and more debuggable than async/await. No Future state machine overhead.

### TypeScript: Sync + optional async

```typescript
// Sync processor (default — for Auto transitions)
const orderInit: StateProcessor<OrderState> = {
  name: () => "OrderInit",
  requires: () => new Set([OrderRequest]),
  produces: () => new Set([PaymentIntent]),
  process: (ctx) => {  // sync
    const req = ctx.get(OrderRequest);
    ctx.put(PaymentIntent, { txnId: `txn-${req.itemId}` });
  },
};

// Async processor (optional — for External transitions only)
const paymentVerify: AsyncStateProcessor<OrderState> = {
  name: () => "PaymentVerify",
  requires: () => new Set([PaymentCallback]),
  produces: () => new Set([PaymentResult]),
  process: async (ctx) => {  // async
    const callback = ctx.get(PaymentCallback);
    const result = await stripe.verify(callback.sessionId);
    ctx.put(PaymentResult, result);
  },
};
```

**Rule: Auto transitions MUST use sync processors. Only External transitions may use async.**

Why? Auto-chain fires multiple transitions in sequence. Making them all async adds unnecessary `await` overhead for what are microsecond judgments.

**Why async is OK in TS?** TypeScript's `Promise` is heap-allocated. No stack size issues. The cost is a microtask queue entry (~1μs), which is negligible.

### Rust: Sync only

```rust
// Everything is sync. Async I/O happens outside the engine.
let flow_id = engine.start_flow(&def, None, initial_data)?;    // sync, ~1μs
engine.resume_and_execute(&flow_id, &def, external_data)?;     // sync, ~300ns

// Async I/O between resume calls (in tower::Service or tokio task):
let auth_result = volta_client.check_auth(&req).await;
```

**Why sync?** Rust's async generates a `Future` state machine at compile time. If the SM engine is async, the `Future` includes `&mut FlowEngine` + `FlowContext` + all processor state across `.await` points. This causes **stack overflow** with 3+ states (see `rust/ASYNC_STACK_ISSUE.md`).

The solution: SM stays sync. Async I/O happens in the caller (tower::Service, tokio task, etc.). See [`async-integration.md`](async-integration.md) for the pattern.

---

## API Comparison

| Concept | Java | TypeScript | Rust |
|---------|------|------------|------|
| State enum | `enum S implements FlowState` | `const enum` + `FlowState` type | `enum S` + `FlowState` trait |
| Processor | `interface StateProcessor` | `StateProcessor<S>` object | `trait StateProcessor<S>` |
| Guard output | `sealed interface GuardOutput` | discriminated union | `enum GuardOutput` |
| Flow context | `Class<T>` keyed `HashMap` | string/symbol keyed `Map` | `TypeId` keyed `HashMap` |
| Definition | `Tramli.define("name", S.class)` | `tramli("name", S)` | `FlowDefinition::builder("name")` |
| Build validation | `build()` throws | `build()` throws | `build()` returns `Result` |
| Mermaid | `MermaidGenerator.generate(def)` | `MermaidGenerator.generate(def)` | `MermaidGenerator::generate(&def)` |
| Data-flow Mermaid | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator::generate_data_flow(&def)` |
| DataFlowGraph | `def.dataFlowGraph()` | `def.dataFlowGraph` | `def.data_flow_graph()` |
| SubFlow | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.sub_flow(runner).on_exit("X", S).end_sub_flow()` |
| State path | `flow.statePathString()` | `flow.statePathString()` | `flow.state_path_string()` |
| Waiting for | `flow.waitingFor()` | `flow.waitingFor()` | N/A (via sub_flow trait) |
| Entry point | `Tramli.define()` | `Tramli.define()` | `Builder::new()` |

## Type Safety Comparison

| Feature | Java | TypeScript | Rust |
|---------|------|------------|------|
| State exhaustiveness | `enum` + `switch` warning | `const enum` (limited) | `enum` + `match` enforced |
| Guard output | `sealed interface` | discriminated union | `enum` (exhaustive) |
| Context type safety | `Class<T>` key → generic return | runtime type assertion | `TypeId` + `downcast` |
| Build errors | `FlowException` at runtime | `Error` at runtime | `FlowError` at compile-check time |

## File Structure

```
tramli/
├── java/                    Java 21+ implementation
│   ├── pom.xml
│   └── src/main/java/com/tramli/
│       ├── Tramli.java          entry point
│       ├── FlowDefinition.java  DSL + 8-item validation
│       ├── FlowEngine.java      ~120 lines
│       └── ...
│
├── ts/                      TypeScript implementation
│   ├── package.json
│   └── src/
│       ├── index.ts             entry point
│       ├── flow-definition.ts   DSL + validation
│       ├── flow-engine.ts
│       └── ...
│
├── rust/                    Rust implementation
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── definition.rs        DSL + validation
│       ├── engine.rs
│       └── ...
│
├── shared-tests/            Cross-language test scenarios
│   └── order-flow.yaml      same flow, tested in all 3 languages
│
└── docs/
    ├── async-integration.md  how to use with async runtimes
    └── language-guide.md     this file
```

## Which language should I use?

| Your stack | Use |
|-----------|-----|
| Java / Kotlin / Spring | `java/` — native enum + sealed, virtual threads |
| Node.js / Deno / Bun | `ts/` — optional async for External transitions |
| Rust / systems programming | `rust/` — zero-cost sync, async outside |
| Multi-language | All three share the same design. Pick per service |
