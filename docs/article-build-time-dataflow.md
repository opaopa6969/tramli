<a id="your-state-machine-crashes-at-runtime-mine-fails-at-build-time"></a>

# Checking State-Machine Data Dependencies Before Execution

This article is for engineers choosing how to implement a process such as order → payment → shipping.
It explains the missing-data problem, how existing state-machine libraries approach it, and what tramli checks when you call `build()`—including the limits of those checks.

<a id="the-problem"></a>

## The problem: reaching a state does not mean its data is ready

An order reaches `CONFIRMED`, and the shipping step reads `PaymentResult`. But one route into `CONFIRMED` never supplies that result. The transition itself is valid; the data needed by the next step is missing.

This can happen when a new branch bypasses a producer, or when an event handler updates the state without storing the event's data. Tests for the usual route may pass while the untested route still fails. To review the change, someone has to trace where the shipping input comes from on every incoming path.

<a id="the-comparison-nobody-makes"></a>

## How other approaches help, and what remains to check

Ordinary functions with explicit arguments and return types make dependencies visible to the compiler. Tests then check the behavior of the connected steps. For a short sequence, this can be enough. State-machine libraries help when the process also needs named stages, branches, and waits for events.

The comparison below is limited to the capabilities discussed in the project's [paper, §5.3–5.4](paper-tramli-constrained-flow-engine.md#53-competitive-comparison), and [market survey dated 2026-08-22](market/2026-08-22.md). It compares approaches to modeling and validation, not current popularity or release status.

| Approach | What it helps with | How it relates to the missing-data problem |
|---|---|---|
| XState v5 | Hierarchical, parallel, and history states; visualization; TypeScript checks for events, action/guard names, and context property types | Its machine-wide context type does not establish which fields have been populated on every path to a particular state |
| Spring Statemachine | Hierarchical states and parallel regions, with Spring ecosystem integration | Its guards and actions let an application handle data requirements; the cited comparison does not describe a tramli-style `requires`/`produces` path check |
| statig (Rust) | Hierarchical states, typed state handling, and state-local storage | Type checking and state-local data help structure the program; they are different from checking declared producer/consumer chains across the flow |
| tramli | Flat states, three transition types, and declared data dependencies | `build()` checks whether every declared input is available on every path to the consumer |

XState v5 has substantial [TypeScript support](https://stately.ai/docs/typescript); describing it as “runtime checks only” would miss that. Its [context](https://stately.ai/docs/context) has a common type across states. For example, if a field is optional because it will be filled later, its type alone does not prove that every route to shipping fills it. The application still needs to handle that condition. This is a narrower claim than saying XState has no type safety.

Likewise, [statig's typed states and state-local storage](https://github.com/mdeloof/statig#state-local-storage) address useful problems. A compile-time type error can appear earlier than tramli's definition validation. Neither that fact nor tramli's path analysis makes one library a complete replacement for the others.

<a id="what-if-build-caught-it"></a>

## What tramli checks when you call `build()`

tramli is a Java, TypeScript, and Rust library with a deliberately restricted model: flat enum states, Auto/External/Branch transitions, and processing organized around one Processor per transition. A Processor declares the data it reads with `requires()` and the data it writes with `produces()`. An External transition's guard declares the data it requires and the data it accepts from the outside event.

`build()` validates the resulting flow definition. It is a library call executed by your application or test, **not a compiler phase**. To catch an invalid definition in CI, a test must actually call it.

Here is the existing abbreviated order definition, with a deliberate wiring mistake. `CREATED` is the initial state and `SHIPPED` is terminal. The application supplies `orderInit`, `guard`, and `shipProcessor`; in this failing example, neither the guard nor a Processor declares `PaymentResult` as output.

```java
var flow = Tramli.define("order", OrderState.class)
    .initiallyAvailable(OrderRequest.class)
    .from(CREATED).auto(PAYMENT_PENDING, orderInit)    // produces PaymentIntent
    .from(PAYMENT_PENDING).external(CONFIRMED, guard)   // requires PaymentIntent
    .from(CONFIRMED).auto(SHIPPED, shipProcessor)        // requires PaymentResult
    .build();  // ← ERROR: PaymentResult not available at CONFIRMED
```

`build()` reports the missing declared input before any order instance executes:

```text
Flow 'order' has 1 validation error(s):
  - Processor 'ShipProcessor' at CONFIRMED -> SHIPPED requires PaymentResult but it may not be available
```

The fix is to make the payment step declare and actually supply `PaymentResult` before shipping. Merely listing it in `produces()` is insufficient if the implementation never writes the value. Adding it to `initiallyAvailable()` would also be incorrect unless the caller really has that result at the start.

<a id="how-it-works"></a>

## How the input and output declarations work

This Processor is taken from the repository's [Java order example](../lang/java/src/test/java/org/unlaxer/tramli/OrderFlowExample.java). It is a demonstration that writes a fixed tracking ID, not an implementation of a shipping service. The example's `SHIP` instance fills the `shipProcessor` role above.

```java
static final StateProcessor SHIP = new StateProcessor() {
    @Override public String name() { return "ShipProcessor"; }
    @Override public Set<Class<?>> requires() { return Set.of(PaymentResult.class); }
    @Override public Set<Class<?>> produces() { return Set.of(ShipmentInfo.class); }
    @Override public void process(FlowContext ctx) {
        ctx.put(ShipmentInfo.class, new ShipmentInfo("TRACK-001"));
    }
};
```

`FlowContext` carries data between steps, keyed by class in Java. `requires()` declares that payment data must already be there; `produces()` declares that shipment data will be added. The validator uses these declarations, without executing the Processor's body.

At a branch join, a type is considered available only if it is available on every incoming path. If one path produces `PaymentResult` and another does not, the downstream requirement is not satisfied. The [validator implementation](../lang/java/src/main/java/org/unlaxer/tramli/FlowDefinition.java) tracks those sets and checks each step's requirements.

This data check is one of the [8 structural checks](../README.md#8-item-build-validation). Others check reachability from the initial state, a path to a terminal state, missing branch targets, and transitions leaving a terminal state. Auto/Branch transitions must form a DAG—a directed graph without cycles—so they cannot loop indefinitely on their own. External waits are a different case; a valid definition does not guarantee that an outside event will arrive.

<a id="what-you-get-for-free"></a>

## Using the same declarations to inspect a flow

A successful build also produces a `DataFlowGraph`, which records declared data availability and producers and consumers. After fixing the payment guard to produce `PaymentResult`, the existing queries are:

```java
graph.availableAt(CONFIRMED);     // {OrderRequest, PaymentIntent, PaymentResult}
graph.producersOf(PaymentIntent.class);  // producer information for OrderInit
graph.deadData();                  // {ShipmentInfo} — produced but never consumed
```

Here `graph` is the flow's `dataFlowGraph()`. The comments describe results, not their exact printed representation. `deadData()` means that no Processor or guard declares a requirement for that type; `ShipmentInfo` may still be a useful final result read by the caller. It is not automatically safe to delete it.

The same declarations support migration planning, test scaffolding, and Mermaid diagrams. These tools help locate dependencies; they do not inspect the business meaning of a payment result or tracking ID.

## What tramli does not guarantee

Passing `build()` means the **declarations and flow structure pass validation**. It does not prove that every runtime execution is correct.

- **Implementations must honor declarations.** A Processor can declare an output and fail to write it, or write an object with incorrect fields. `build()` does not run that implementation. Java's `ctx.get()` throws if a requested value is missing; passing definition validation does not remove the need to test the contract.
- **Input values and business rules need their own checks.** The existence of `PaymentResult` does not prove that payment succeeded or that shipping should proceed.
- **The model is less expressive.** tramli has flat states and SubFlow composition, not hierarchical, parallel, or history-state semantics. XState's richer state model can express behavior that does not fit tramli directly. Spring integration and statig's Rust-specific facilities may also matter more than path analysis for a particular application.
- **Declarations add maintenance work.** State definitions and input/output contracts must stay consistent with the code. A short sequence of ordinary function calls can be easier to maintain.
- **It is not a distributed execution platform.** As the market survey explains, Temporal addresses durable execution and recovery in a separate service layer. tramli is an in-application library; its structural checks do not supply that infrastructure.

<a id="3-languages-same-guarantee"></a>

## Three implementations and where to start

tramli has implementations for Java (21+), TypeScript (Node 18+), and Rust (1.75+), sharing the flow model and 8 structural checks. The [paper's evaluation](paper-tramli-constrained-flow-engine.md#55-threats-to-validity) reports 125 tests across the implementations; that is the paper's recorded count, not a current test result or a formal proof that all behavior is identical.

Use the [README quick start](../README.md#quick-start) for setup and full examples. The README tracks `main`, so check its release links and the [changelog](../CHANGELOG.md) when using a published package.

## When to use tramli

Consider it for login, payment, approval, or in-application pipeline logic where branches or external waits make it difficult to see whether each step's data will be ready. Its specific contribution is making those dependencies explicit and checking their consistency before running a flow instance.

Choose based on the problem that is hardest in your application: data dependencies, a richer state model, framework integration, or durable distributed execution. For how explicit contracts help a reviewer decide what to read, see [Why tramli Works — The Attention Budget](why-tramli-works.md).

*tramli is open source: [github.com/opaopa6969/tramli](https://github.com/opaopa6969/tramli)*
