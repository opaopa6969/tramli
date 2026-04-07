# Your State Machine Crashes at Runtime. Mine Fails at Build Time.

> How tramli catches data-flow bugs before your code runs.

## The Problem

You write a state machine. State A produces `OrderRequest`. State B expects `PaymentResult`. You deploy. At 3am, state B crashes: "PaymentResult not found in context."

Every state machine library has this problem. XState, Spring Statemachine, statig — they all defer data dependency checks to runtime. You only discover missing data when a real user hits that code path.

## What if `build()` caught it?

```java
var flow = Tramli.define("order", OrderState.class)
    .initiallyAvailable(OrderRequest.class)
    .from(CREATED).auto(PAYMENT_PENDING, orderInit)    // produces PaymentIntent
    .from(PAYMENT_PENDING).external(CONFIRMED, guard)   // requires PaymentIntent
    .from(CONFIRMED).auto(SHIPPED, shipProcessor)        // requires PaymentResult
    .build();  // ← ERROR: PaymentResult not available at CONFIRMED
```

```
Flow 'order' has 1 validation error(s):
  - Processor 'ShipProcessor' at CONFIRMED → SHIPPED requires PaymentResult
    but it may not be available
```

This runs at definition time — before any flow instance executes. No deployment. No 3am page.

## How it works

Every processor declares what data it needs and what it provides:

```java
class ShipProcessor implements StateProcessor {
    Set<Class<?>> requires() { return Set.of(PaymentResult.class); }
    Set<Class<?>> produces() { return Set.of(ShipmentInfo.class); }
    void process(FlowContext ctx) {
        PaymentResult payment = ctx.get(PaymentResult.class);  // guaranteed non-null
        ctx.put(ShipmentInfo.class, new ShipmentInfo("TRACK-001"));
    }
}
```

At `build()`, tramli walks every path through the flow graph and verifies:
- Every `requires()` is satisfied by a prior `produces()` or `initiallyAvailable()`
- Auto/Branch transitions form a DAG (no infinite loops)
- All states are reachable from initial
- Terminal states have no outgoing transitions
- ...8 checks total

## What you get for free

Once `build()` passes, tramli derives a **DataFlowGraph** — a map of which data flows where:

```java
graph.availableAt(CONFIRMED);     // {OrderRequest, PaymentIntent, PaymentResult}
graph.producersOf(PaymentIntent);  // [{name: "OrderInit", from: CREATED}]
graph.deadData();                  // {ShipmentInfo} — produced but never consumed
```

This powers migration planning, test scaffolding, and Mermaid diagram generation — all from the same `requires/produces` declarations you already wrote.

## The comparison nobody makes

| | XState v5 | Spring SM | **tramli** |
|---|---|---|---|
| "Data X missing at state Y" | Not detected | Not detected | **Caught at build()** |
| Data dependency chain | Manual tracking | Manual tracking | **Automatic verification** |
| Transition to nonexistent state | Compiles fine | Compiles fine | **Enum = compile error** |

XState gives you full Statechart power (parallel states, history). Spring gives you ecosystem integration. tramli gives you **the guarantee that your data flows correctly**.

## 3 languages, same guarantee

tramli ships as zero-dependency libraries for Java (21+), TypeScript (Node 18+), and Rust (1.75+). Same DSL, same 8 validations, same Mermaid output. 125 tests across all three.

```bash
# Pick your language
mvn install    # Java: org.unlaxer:tramli
npm install @unlaxer/tramli  # TypeScript
cargo add tramli  # Rust
```

## When to use tramli

- Authentication flows (OAuth, Passkey, MFA)
- Payment processing (order → payment → fulfillment)
- Approval workflows (request → review → approve)
- Deployment pipelines (build → test → deploy → verify)

If your state machine has **data that flows between steps**, tramli catches the bugs that other libraries can't.

---

*tramli is open source: [github.com/opaopa6969/tramli](https://github.com/opaopa6969/tramli)*
