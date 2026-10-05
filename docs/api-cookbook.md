# tramli API Cookbook

This cookbook is for engineers implementing or debugging a tramli flow, including those using tramli for the first time.
It explains which API to use for a task, when it helps, and how to call it in Java, TypeScript, or Rust.

[日本語版（主要 API の使用例）](api-cookbook-ja.md)

## How to use this cookbook

Use the task table below to look up a recipe. Each recipe starts with its purpose, followed by language-specific examples; the snippets assume application types and processors such as `OrderRequest` and `orderInit` have already been defined.

For a first reading:

1. Follow the [README Quick Start](../README.md#quick-start) for a complete flow, then read [FlowDefinition Builder](#flowdefinition-builder) and [FlowContext](#flowcontext) to define transitions and their data.
2. Read [FlowEngine](#flowengine) and [FlowInstance](#flowinstance) to start a flow, resume it when an event arrives, and inspect its progress.
3. Read [DataFlowGraph](#dataflowgraph) and [Logging](#logging) when checking dependencies or diagnosing failures. For a sequence with no external waits, start with [Pipeline](#pipeline).

Rust users can start with [the trait implementation examples](#rust-implementing-processors-guards-and-branches) before wiring those components into the builder.

## Find a recipe

| What you want to do | Read |
|--------------------|------|
| Implement a processor, event check, or branch in Rust | [Rust implementations](#rust-implementing-processors-guards-and-branches) |
| Run a step automatically, wait for an event, or choose a route | [FlowDefinition Builder](#flowdefinition-builder) |
| Reuse a child flow within a larger process | [SubFlow](#fromstatesubflowdefonexitx-sendsubflow) |
| Choose where failed processing goes | [State-specific error routing](#onerrorfrom-to), [error classification](#flowerrortype) |
| Declare initial data, set deadlines, and validate the definition | [Initial data and builder settings](#initiallyavailabletypes) |
| Start a new flow or deliver an external response | [FlowEngine](#flowengine) |
| Show progress, inspect failures, or find missing input | [FlowInstance](#flowinstance) |
| Pass typed data between steps or prepare it for storage | [FlowContext](#flowcontext) |
| Find data producers, consumers, unused outputs, or change impact | [DataFlowGraph](#dataflowgraph) |
| Plan a language migration or compare flow versions | [Migration helpers](#migrationorder), [version compatibility](#versioncompatibilityv1-v2) |
| Customize a state diagram or insert a plugin flow | [FlowDefinition](#flowdefinition) |
| Record transitions, event rejection, data writes, or errors | [Logging](#logging) |
| Run and validate a straight sequence of steps | [Pipeline](#pipeline) |
| Generate diagrams or processor implementation templates | [Code Generation](#code-generation) |

## Terms used in the examples

- A **state** is a stage such as `PAYMENT_PENDING`; a **transition** moves the flow from one state to another. A **terminal state** ends the flow.
- A **Processor** performs the work for a transition. A **Guard** accepts or rejects an external event, such as a payment service's HTTP notification (webhook). A **Branch** chooses a route from the current data.
- **FlowContext** holds data shared by steps. **requires / produces** declare the data a component needs and the data it makes available; these declarations let `build()` check dependencies before execution.
- A **FlowDefinition** describes the process. A **FlowInstance** is one execution of it, such as one order; a **FlowStore** saves and loads those instances.
- An **auto-chain** is the sequence of automatic transitions that runs until the flow needs external input or finishes. A **SubFlow** is a child flow whose exit is mapped to a parent state; each flow still uses flat states.
- The login examples use **OIDC** (OpenID Connect), a login protocol built on OAuth 2.0. A callback carries the response from the identity provider; **MFA** means multi-factor authentication, an additional identity check.

## Language conventions

- **Java:** context data is identified by its class, such as `OrderRequest.class`; durations use `Duration`.
- **TypeScript (TS):** `flowKey<T>()` creates a string-based key associated with a data type. Engine methods use `async/await`, and durations are in milliseconds.
- **Rust:** `TypeId` identifies a type in the context, so reads use `ctx.get::<T>()`. The `requires![]` macro makes type lists, traits define component behavior, and closures provide callbacks; `Arc<FlowDefinition<S>>` shares a definition safely across threads using reference counting.

Read the example for your language: method names, return values, and available helpers differ. Language-specific limits are noted beside the recipes.

---

## Rust: Implementing Processors, Guards, and Branches

Use these examples when implementing the components that a Rust flow will call. A **trait** defines the methods a component must provide; implement it on a struct, then pass that component to the builder.

### `StateProcessor<S>` (Auto transitions)

**When to use:** An automatic step needs to read input and write its result, such as creating a payment intent from an order. Implement `process` and declare the input and output types with `requires` and `produces`.

```rust
struct OrderInit;

impl StateProcessor<OrderState> for OrderInit {
    fn name(&self) -> &str { "OrderInit" }
    fn requires(&self) -> Vec<TypeId> { requires![OrderRequest] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentIntent] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let req = ctx.get::<OrderRequest>()?;
        ctx.put(PaymentIntent { txn_id: format!("txn-{}", req.item_id) });
        Ok(())
    }
}
// Use: .from(Created).auto(PaymentPending, Box::new(OrderInit))
```

### `TransitionGuard<S>` (External transitions)

**When to use:** An external response must be checked before the flow advances, such as accepting only a successful payment callback. Implement `validate` to return acceptance with output data or rejection with a reason.

```rust
struct PaymentGuard;

impl TransitionGuard<OrderState> for PaymentGuard {
    fn name(&self) -> &str { "PaymentGuard" }
    fn requires(&self) -> Vec<TypeId> { requires![PaymentCallback] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentResult] }
    fn validate(&self, ctx: &FlowContext) -> GuardOutput {
        let cb = match ctx.find::<PaymentCallback>() {
            Some(cb) => cb,
            None => return GuardOutput::rejected("Missing callback"),
        };
        if cb.status == "ok" {
            GuardOutput::accept_with(PaymentResult { success: true })
        } else {
            GuardOutput::rejected(format!("Payment declined: {}", cb.status))
        }
    }
}
// Use: .from(PaymentPending).external(Confirmed, Box::new(PaymentGuard))
```

### `BranchProcessor<S>` (Branch transitions)

**When to use:** The flow needs to choose a route from data already in the context. Implement `decide` to return the label that the builder maps to a destination.

```rust
struct RiskBranch;

impl BranchProcessor<OrderState> for RiskBranch {
    fn name(&self) -> &str { "RiskBranch" }
    fn requires(&self) -> Vec<TypeId> { requires![FraudScore] }
    fn decide(&self, ctx: &FlowContext) -> String {
        let score = ctx.find::<FraudScore>().map(|s| s.value).unwrap_or(0);
        if score > 80 { "blocked".into() }
        else if score > 40 { "high_risk".into() }
        else { "low_risk".into() }
    }
}
// Use: .from(RiskChecked).branch(Box::new(RiskBranch)).to(...)
```

### `SubFlowRunner` (custom sub-flow, v1.8.0+)

**When to use:** A child process needs a custom runner instead of being supplied directly as a FlowDefinition. Usually `SubFlowAdapter` handles this integration; a custom `SubFlowRunner` provides the child instance and its terminal-state names.

```rust
// For most cases, SubFlowAdapter wraps a FlowDefinition automatically:
SubFlowAdapter::new(Arc::new(payment_detail_def))
// See the subFlow() section below.

// Custom implementation (when you need non-FlowDefinition-based sub-flows):
struct MySubFlowRunner { def: Arc<FlowDefinition<SubState>> }

impl SubFlowRunner for MySubFlowRunner {
    fn name(&self) -> &str { "my-sub-flow" }
    fn terminal_names(&self) -> Vec<String> { vec!["Done".into(), "Failed".into()] }
    fn create_instance(&self) -> Box<dyn SubFlowInstance> {
        SubFlowAdapter::new(self.def.clone()).create_instance()
    }
}
// v1.8.0 renamed instantiate() → create_instance() — update any custom runners
```

---

## FlowDefinition Builder

Use the builder to declare the allowed transitions, initial data, and failure routes in one place. Calling `build()` checks that definition before the engine uses it.

### `from(state).auto(to, processor)`

**When to use:** A step such as creating a payment request should run as soon as the flow reaches its source state. An Auto transition runs its Processor without waiting for an outside event.

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit runs → PAYMENT_PENDING
```

```typescript
.from('CREATED').auto('PAYMENT_PENDING', orderInit)
// CREATED → OrderInit runs → PAYMENT_PENDING
```

```rust
.from(Created).auto(PaymentPending, order_init)
// Created → order_init runs → PaymentPending
```

### `from(state).external(to, guard)`

**When to use:** Payment confirmation or a user action must arrive before processing can continue. An External transition waits for `resumeAndExecute()`, then asks its Guard to accept or reject the supplied data.

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// Flow stops at PAYMENT_PENDING until resumeAndExecute() is called
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard)
// Flow stops at PAYMENT_PENDING until resumeAndExecute() is called
```

```rust
.from(PaymentPending).external(Confirmed, payment_guard)
// Flow stops at PaymentPending until resume_and_execute() is called
```

### `from(state).external(to, guard, timeout)`

**When to use:** A particular wait, such as payment confirmation, needs a deadline. Set a timeout on that External transition so the flow expires if no event arrives in time.

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
// 5 minutes to complete payment, then EXPIRED
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard, { timeout: 5 * 60_000 })
// 5 minutes to complete payment, then EXPIRED
```

```rust
.from(PaymentPending).external_with_timeout(Confirmed, payment_guard, Duration::from_secs(300))
// 5 minutes to complete payment, then EXPIRED
```

### `from(state).branch(branch).to(s, label).endBranch()`

**When to use:** The next step depends on data, such as a risk score deciding whether additional authentication is needed. The Branch returns a label, and the definition maps each label to a destination.

```java
.from(RISK_CHECKED).branch(riskBranch)
    .to(COMPLETE, "low_risk", sessionIssue)
    .to(MFA_REQUIRED, "high_risk", mfaInit)
    .to(BLOCKED, "blocked")
    .endBranch()
// RiskBranch.decide() returns "low_risk", "high_risk", or "blocked"
```

```typescript
.from('RISK_CHECKED').branch(riskBranch)
    .to('COMPLETE', 'low_risk', sessionIssue)
    .to('MFA_REQUIRED', 'high_risk', mfaInit)
    .to('BLOCKED', 'blocked')
    .endBranch()
// riskBranch.decide() returns 'low_risk', 'high_risk', or 'blocked'
```

```rust
.from(RiskChecked).branch(risk_branch)
    .to(Complete, "low_risk")
    .to(MfaRequired, "high_risk")
    .to(Blocked, "blocked")
    .end_branch()
// risk_branch.decide() returns "low_risk", "high_risk", or "blocked"
```

### `from(state).subFlow(def).onExit("X", s).endSubFlow()`

**When to use:** A process such as payment has its own steps and should be reused within a larger flow. A SubFlow runs that child process and maps each terminal state, where the child finishes, to a parent state.

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
    .endSubFlow()
// paymentDetailFlow runs inside PAYMENT state, then maps terminal → parent state
```

```typescript
.from('PAYMENT').subFlow(paymentDetailFlow)
    .onExit('DONE', 'PAYMENT_COMPLETE')
    .onExit('FAILED', 'PAYMENT_FAILED')
    .endSubFlow()
// paymentDetailFlow runs inside PAYMENT state, then maps terminal → parent state
```

```rust
.from(Payment).sub_flow(Box::new(SubFlowAdapter::new(payment_detail_def)))
    .on_exit("DONE", PaymentComplete)
    .on_exit("FAILED", PaymentFailed)
    .end_sub_flow()
// payment_detail_def runs inside Payment, then maps terminal → parent state
```

### `.onError(from, to)`

**When to use:** Failure at one step needs a different destination from the rest of the flow, such as a retry path for a token exchange. `onError` assigns the error destination for that source state.

```java
.onError(TOKEN_EXCHANGE, RETRIABLE_ERROR)
// If TokenExchange throws → RETRIABLE_ERROR (not the default error state)
```

```typescript
.onError('TOKEN_EXCHANGE', 'RETRIABLE_ERROR')
// If TokenExchange throws → RETRIABLE_ERROR (not the default error state)
```

```rust
.on_error(TokenExchange, RetriableError)
// If processor at TokenExchange fails → RetriableError (not the default error state)
```

### `.onStepError(from, ExceptionClass, to)`

**When to use:** A timeout and an invalid token need different responses even though they occur at the same step. Route by exception type in Java/TypeScript, or by a predicate (an error-checking function) in Rust; unmatched errors fall back to the state error route.

```java
.onStepError(TOKEN_EXCHANGE, HttpTimeoutException.class, RETRIABLE_ERROR)
.onStepError(TOKEN_EXCHANGE, InvalidTokenException.class, TERMINAL_ERROR)
// Timeout → retry, invalid token → fatal. Unmatched → onError fallback
```

```typescript
.onStepError('TOKEN_EXCHANGE', HttpTimeoutError, 'RETRIABLE_ERROR')
.onStepError('TOKEN_EXCHANGE', InvalidTokenError, 'TERMINAL_ERROR')
// Timeout → retry, invalid token → fatal. Unmatched → onError fallback
```

```rust
.on_step_error(TokenExchange, |e| e.code == "TIMEOUT", "Timeout", RetriableError)
.on_step_error(TokenExchange, |e| e.code == "INVALID_TOKEN", "InvalidToken", TerminalError)
// Timeout → retry, invalid token → fatal. Unmatched → on_error fallback
```

### `.onAnyError(state)`

**When to use:** Every unfinished state needs a destination for failures that have no more specific handler. `onAnyError` supplies this fallback, such as cancelling the order.

```java
.onAnyError(CANCELLED)
// Any unhandled error from any state → CANCELLED
```

```typescript
.onAnyError('CANCELLED')
// Any unhandled error from any state → CANCELLED
```

```rust
.on_any_error(Cancelled)
// Any unhandled error from any state → Cancelled
```

### `.initiallyAvailable(types...)`

**When to use:** The first Processor needs input supplied by the caller, such as an order request. Declare its type so `build()` can check dependencies; supply the actual value when calling `startFlow()`.

```java
.initiallyAvailable(OrderRequest.class)
// build() verifies the first processor's requires() is satisfied by this
```

```typescript
.initiallyAvailable(OrderRequest)
// build() verifies the first processor's requires is satisfied by this
```

```rust
.initially_available(requires![OrderRequest])
// build() verifies the first processor's requires() is satisfied by this
```

### `.ttl(duration)` / `.setTtl(ms)`

**When to use:** The whole process must finish within a fixed lifetime, regardless of its current state. TTL (time-to-live) sets that overall limit; an External timeout limits one wait.

```java
.ttl(Duration.ofHours(24))
// Flow expires after 24 hours regardless of state
```

```typescript
.setTtl(24 * 60 * 60_000)
// Flow expires after 24 hours regardless of state
```

```rust
.ttl(Duration::from_secs(86400))
// Flow expires after 24 hours regardless of state
```

### `.maxGuardRetries(n)` / `.setMaxGuardRetries(n)`

**When to use:** Repeatedly rejected external input should eventually end in an error route. Set the rejection limit here; it counts Guard rejections rather than automatically resending a request.

```java
.maxGuardRetries(3)
// After 3 rejections → error transition
```

```typescript
.setMaxGuardRetries(3)
// After 3 rejections → error transition
```

```rust
.max_guard_retries(3)
// After 3 rejections → error transition
```

### `.onStateEnter(state, action)` / `.onStateExit(state, action)`

**When to use:** Entering or leaving a state should trigger an action, such as writing an audit record. Register a callback, a function the engine calls at that point in the transition.

```java
builder
    .onStateEnter(PAYMENT_PENDING, ctx -> auditLog.record("entered payment"))
    .onStateExit(PAYMENT_PENDING, ctx -> auditLog.record("exited payment"))
```

```typescript
builder
    .onStateEnter('PAYMENT_PENDING', ctx => auditLog.record('entered payment'))
    .onStateExit('PAYMENT_PENDING', ctx => auditLog.record('exited payment'))
```

```rust
Builder::new("order")
    .on_state_enter(PaymentPending, |ctx| { ctx.put(EnteredPayment(true)); })
    .on_state_exit(PaymentPending, |ctx| { ctx.put(ExitedPayment(true)); })
    // Closures run synchronously during transition — keep them lightweight
```

### `.build()`

**When to use:** After declaring the flow and before running it, check that its transitions and data dependencies are consistent. `build()` performs 8+ structural checks and constructs the DataFlowGraph, which records which steps produce and require each data type.

```java
var def = builder.build();
// Throws FlowException with actionable error messages if invalid
```

```typescript
const def = builder.build();
// Throws FlowError with actionable error messages if invalid
```

```rust
let def = builder.build()?;
// Returns Err(FlowError) with actionable error messages if invalid
```

### `.warnings()`

**When to use:** After building, inspect diagnostics that may need design review. A liveness warning flags a risk that a flow will stop making progress, for example because it waits for an external event that may never arrive.

```java
var def = builder.build();
for (String w : def.warnings()) {
    log.warn("tramli: {}", w);
}
// "Perpetual flow 'circuitBreaker' has External transitions — liveness risk"
```

```typescript
const def = builder.build();
for (const w of def.warnings) {
    console.warn(`tramli: ${w}`);
}
// "Perpetual flow 'circuitBreaker' has External transitions — liveness risk"
```

```rust
let result = builder.build_and_validate();
for err in &result.errors {
    eprintln!("tramli: {} — {}", err.code, err.message);
}
// Use build_and_validate() for detailed structural diagnostics
```

---

## FlowEngine

Use the engine to execute a definition for a particular order, login attempt, or other request. It starts new instances and resumes existing ones when external input arrives.

### `startFlow(definition, sessionId, initialData)`

**When to use:** A new order or login attempt needs its own execution and initial data. Starting a flow runs its auto-chain, the automatic steps before the next external wait or completion.

```java
var flow = engine.startFlow(oidcFlow, "session-123",
    Map.of(OidcRequest.class, new OidcRequest("GOOGLE", "/")));
// Auto-chain fires: INIT → REDIRECTED (stops at External)
```

```typescript
const flow = await engine.startFlow(oidcFlow, 'session-123',
    Tramli.data([OidcRequest, { provider: 'GOOGLE', redirectUri: '/' }]));
// Auto-chain fires: INIT → REDIRECTED (stops at External)
```

```rust
let mut engine = FlowEngine::new(InMemoryFlowStore::new());
let flow_id = engine.start_flow(oidc_def.clone(), "session-123",
    vec![(TypeId::of::<OidcRequest>(), Box::new(OidcRequest { provider: "GOOGLE".into(), redirect_uri: "/".into() }) as Box<dyn CloneAny>)])?;
// Auto-chain fires: Init → Redirected (stops at External). Returns flow ID.
```

### `resumeAndExecute(flowId, definition, externalData)`

**When to use:** An outside response has arrived for a flow that is already waiting. Pass the flow ID and event data to resume it; the Guard validates the input before the following automatic steps run.

```java
flow = engine.resumeAndExecute(flow.id(), oidcFlow,
    Map.of(OidcCallback.class, new OidcCallback("auth-code", "state")));
// Guard validates → auto-chain fires → COMPLETE
```

```typescript
const resumed = await engine.resumeAndExecute(flow.id, oidcFlow,
    Tramli.data([OidcCallback, { code: 'auth-code', state: 'state' }]));
// Guard validates → auto-chain fires → COMPLETE
```

```rust
engine.resume_and_execute(&flow_id,
    vec![(TypeId::of::<OidcCallback>(), Box::new(OidcCallback { code: "auth-code".into(), state: "state".into() }) as Box<dyn CloneAny>)])?;
// Guard validates → auto-chain fires → COMPLETE
let flow = engine.store.get(&flow_id).unwrap();
```

---

## FlowInstance

Use a FlowInstance to inspect one execution: its current state, result, error, and data requirements.

### `currentState()`

**When to use:** A screen or handler needs to know the current stage, such as whether payment is still pending. Read the instance state rather than maintaining a separate progress flag.

```java
if (flow.currentState() == PAYMENT_PENDING) {
    return "Waiting for payment...";
}
```

```typescript
if (flow.currentState === 'PAYMENT_PENDING') {
    return 'Waiting for payment...';
}
```

```rust
let flow = engine.store.get(&flow_id).unwrap();
if flow.current_state() == PaymentPending {
    return "Waiting for payment...";
}
```

### `isCompleted()` / `exitState()`

**When to use:** A caller must distinguish an unfinished flow from one that completed, was blocked, or expired. Check completion first, then use the exit state to choose the follow-up action.

```java
if (flow.isCompleted()) {
    switch (flow.exitState()) {
        case "COMPLETE" -> sendWelcomeEmail(flow);
        case "BLOCKED" -> notifySecurityTeam(flow);
        case "EXPIRED" -> log.warn("Flow timed out");
    }
}
```

```typescript
if (flow.isCompleted) {
    switch (flow.exitState) {
        case 'COMPLETE': sendWelcomeEmail(flow); break;
        case 'BLOCKED': notifySecurityTeam(flow); break;
        case 'EXPIRED': console.warn('Flow timed out'); break;
    }
}
```

```rust
if flow.is_completed() {
    match flow.exit_state() {
        Some("COMPLETE") => send_welcome_email(&flow),
        Some("BLOCKED") => notify_security_team(&flow),
        Some("EXPIRED") => eprintln!("Flow timed out"),
        _ => {}
    }
}
```

### `lastError()`

**When to use:** The flow has reached an error state and you need the recorded cause for logs or diagnosis. `lastError()` exposes the error details associated with that failure.

```java
if (flow.currentState() == ERROR) {
    log.error("Flow failed: {}", flow.lastError());
    // "HttpTimeoutException: Connection timed out"
}
```

```typescript
if (flow.currentState === 'ERROR') {
    console.error(`Flow failed: ${flow.lastError}`);
    // "Error: Connection timed out"
}
```

```rust
if flow.current_state() == Error {
    if let Some(err) = flow.last_error() {
        eprintln!("Flow failed: {}", err);
        // "PROC_ERROR: Connection timed out"
    }
}
```

### `activeSubFlow()`

**When to use:** The parent is at a broad stage such as payment, but you need to see the child process running inside it. Inspect the active child in Java/TypeScript; the Rust example uses the state path.

```java
if (flow.activeSubFlow() != null) {
    log.info("In sub-flow, inner state: {}",
        flow.activeSubFlow().currentState());
}
```

```typescript
if (flow.activeSubFlow != null) {
    console.log(`In sub-flow, inner state: ${flow.activeSubFlow.currentState}`);
}
```

```rust
// Rust uses state_path() instead of activeSubFlow()
let path = flow.state_path();
if path.len() > 1 {
    println!("In sub-flow, inner state: {}", path.last().unwrap());
}
```

### `statePath()` / `statePathString()`

**When to use:** A parent state alone does not show where a child flow is waiting. A state path lists the current parent and child states, such as `PAYMENT/CONFIRM`, for logs or a status display.

```java
log.info("Flow at: {}", flow.statePathString());
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

```typescript
console.log(`Flow at: ${flow.statePathString()}`);
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

```rust
println!("Flow at: {}", flow.state_path_string());
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

### `waitingFor()`

**When to use:** A client needs to know which external input the flow is waiting for. This query identifies the expected data types so the client can prepare the next event.

```java
Set<Class<?>> needed = flow.waitingFor();
// {OidcCallback.class} — client needs to send OAuth callback data
```

```typescript
const needed: string[] = flow.waitingFor();
// ['OidcCallback'] — client needs to send OAuth callback data
```

```rust
let needed: Vec<TypeId> = flow.waiting_for();
// [TypeId::of::<OidcCallback>()] — client needs to send OAuth callback data
```

### `availableData()`

**When to use:** You need the data types expected to be available at the current state. This query uses the data-flow graph; use the context accessors when inspecting actual stored values.

```java
Set<Class<?>> available = flow.availableData();
// {OidcRequest, OidcRedirect} — what's been produced so far
```

```typescript
const available: Set<string> = flow.availableData();
// Set {'OidcRequest', 'OidcRedirect'} — what's been produced so far
```

```rust
let available: HashSet<TypeId> = flow.available_data();
// HashSet containing TypeId::of::<OidcRequest>(), etc. — what's been produced so far
```

### `missingFor()`

**When to use:** Processing cannot continue and you suspect missing input. This query lists data required by the next transition but absent from the context.

```java
Set<Class<?>> missing = flow.missingFor();
// {PaymentResult} — this type is required but not yet in context
```

```typescript
const missing: string[] = flow.missingFor();
// ['PaymentResult'] — this type is required but not yet in context
```

```rust
let missing: Vec<TypeId> = flow.missing_for();
// [TypeId::of::<PaymentResult>()] — this type is required but not yet in context
```

### `withVersion(n)` / `set_version(n)` (Rust)

**When to use:** A FlowStore saves a new version and the in-memory instance must reflect that version. Optimistic locking compares versions to detect concurrent updates; these methods update the instance version after the store saves it.

```java
// After SQL UPDATE ... SET version = version + 1
flow = flow.withVersion(flow.version() + 1);
```

```typescript
// After SQL UPDATE ... SET version = version + 1
const updated = flow.withVersion(flow.version + 1);
```

```rust
// After SQL UPDATE ... SET version = version + 1
let next_version = flow.version() + 1;
flow.set_version(next_version);
```

Rust's `set_version_public()` remains as a deprecated compatibility alias.

### `stateEnteredAt()`

**When to use:** You need to measure how long a flow has been in its current state, for example while investigating a slow external response. Java/TypeScript expose the entry time; the Rust example below measures total flow age because the state-entry accessor is internal.

```java
Instant entered = flow.stateEnteredAt();
Duration elapsed = Duration.between(entered, Instant.now());
log.info("Waiting for {} seconds", elapsed.getSeconds());
```

```typescript
const entered: Date = flow.stateEnteredAt;
const elapsedMs = Date.now() - entered.getTime();
console.log(`Waiting for ${Math.floor(elapsedMs / 1000)} seconds`);
```

```rust
// state_entered_at() is available to engine internals (pub(crate))
// For external timeout checks, compare flow.created_at with Instant::now()
let elapsed = flow.created_at.elapsed();
println!("Flow age: {} seconds", elapsed.as_secs());
```

---

## FlowContext

Use FlowContext to pass typed data between steps. Each Processor declares its required inputs and outputs, then reads or writes the corresponding values here.

### `get(key)` / `find(key)` / `put(key, value)` / `has(key)`

**When to use:** A Processor needs input from an earlier step or must pass its output to a later one. Use `get` for required data, `find` for optional data, `put` to store a value, and `has` to check whether it exists.

```java
// In a processor
OrderRequest req = ctx.get(OrderRequest.class);          // throws if missing
Optional<Coupon> coupon = ctx.find(Coupon.class);         // optional
ctx.put(PaymentIntent.class, new PaymentIntent("txn-1")); // write
if (ctx.has(FraudScore.class)) { ... }                    // check
```

```typescript
// In a processor — flowKey<T> gives full type inference
const req = ctx.get(OrderRequest);                           // throws if missing
const coupon = ctx.find(Coupon);                             // T | undefined
ctx.put(PaymentIntent, { transactionId: 'txn-1' });         // write
if (ctx.has(FraudScore)) { /* ... */ }                       // check
```

```rust
let req = ctx.get::<OrderRequest>()?;                        // returns Result — Err if missing
let coupon = ctx.find::<Coupon>();                            // Option<&Coupon>
ctx.put(PaymentIntent { transaction_id: "txn-1".into() });   // write (type inferred)
if ctx.has::<FraudScore>() { /* ... */ }                      // check
```

### `registerAlias(type, alias)` / `toAliasMap()` / `fromAliasMap(map)`

**When to use:** Context data must be saved under readable names in JSON. An alias is a string name for a type or key; Java/TypeScript convert to and from alias maps, while Rust exposes the mapping for your own serialization code.

```java
// Setup (once)
ctx.registerAlias(OrderRequest.class, "OrderRequest");
ctx.registerAlias(PaymentIntent.class, "PaymentIntent");

// Save to DB
String json = objectMapper.writeValueAsString(ctx.toAliasMap());
// {"OrderRequest": {...}, "PaymentIntent": {...}}

// Load from DB
Map<String, Object> map = objectMapper.readValue(json, MAP_TYPE);
ctx.fromAliasMap(map);
```

```typescript
// Setup (once)
ctx.registerAlias(OrderRequest, 'OrderRequest');
ctx.registerAlias(PaymentIntent, 'PaymentIntent');

// Save to DB
const json = JSON.stringify(Object.fromEntries(ctx.toAliasMap()));
// {"OrderRequest": {...}, "PaymentIntent": {...}}

// Load from DB
const map = new Map(Object.entries(JSON.parse(json)));
ctx.fromAliasMap(map);
```

```rust
// Setup (once) — turbofish syntax specifies the Rust type
ctx.register_alias::<OrderRequest>("OrderRequest");
ctx.register_alias::<PaymentIntent>("PaymentIntent");

// Query alias ↔ TypeId mapping
ctx.alias_of(&TypeId::of::<OrderRequest>());       // Some("OrderRequest")
ctx.type_id_of_alias("OrderRequest");               // Some(&TypeId::of::<OrderRequest>())
// Use aliases to build your own JSON serialization layer
```

---

## DataFlowGraph

Use this graph when you need to understand or test the data dependencies declared by the flow. Queries describe types and their producers or consumers; the validation helpers below compare those declarations with an actual context.

### `availableAt(state)`

**When to use:** Before adding a step, check which data types are available on every path to its source state. `availableAt` answers from the definition, without running a flow instance.

```java
Set<Class<?>> available = graph.availableAt(PAYMENT_CONFIRMED);
// {OrderRequest, PaymentIntent, PaymentResult}
```

```typescript
const available: Set<string> = graph.availableAt('PAYMENT_CONFIRMED');
// Set {'OrderRequest', 'PaymentIntent', 'PaymentResult'}
```

```rust
let graph = def.data_flow_graph();
let available: HashSet<TypeId> = graph.available_at(PaymentConfirmed);
// Contains TypeId::of::<OrderRequest>(), TypeId::of::<PaymentIntent>(), ...

// Rust also has explain() for detailed diagnostics
let info = graph.explain(PaymentConfirmed);
// ExplainResult { state, available, missing: [MissingInfo { type_id, needed_by, reason }] }
```

### `producersOf(type)` / `consumersOf(type)`

**When to use:** You need to locate the steps that create or read a type before changing it. Producers declare the type in `produces`; consumers declare it in `requires`.

```java
graph.producersOf(PaymentIntent.class);
// [{name: "OrderInit", from: CREATED, to: PAYMENT_PENDING}]

graph.consumersOf(PaymentIntent.class);
// [{name: "PaymentGuard", from: PAYMENT_PENDING, to: CONFIRMED}]
```

```typescript
graph.producersOf(PaymentIntent);
// [{name: 'OrderInit', fromState: 'CREATED', toState: 'PAYMENT_PENDING', kind: 'processor'}]

graph.consumersOf(PaymentIntent);
// [{name: 'PaymentGuard', fromState: 'PAYMENT_PENDING', toState: 'CONFIRMED', kind: 'guard'}]
```

```rust
let producers = graph.producers_of(&TypeId::of::<PaymentIntent>());
// &[NodeInfo { name: "OrderInit", from_state: Created, to_state: PaymentPending, kind: "processor" }]

let consumers = graph.consumers_of(&TypeId::of::<PaymentIntent>());
// &[NodeInfo { name: "PaymentGuard", from_state: PaymentPending, to_state: Confirmed, kind: "guard" }]
```

### `deadData()`

**When to use:** You suspect a step is producing data that no later step needs. Dead data means a type is produced but never declared as required within the flow; check whether callers use it as a final result before removing it.

```java
Set<Class<?>> dead = graph.deadData();
// {ShipmentInfo} — produced at SHIPPED but no downstream processor uses it
```

```typescript
const dead: Set<string> = graph.deadData();
// Set {'ShipmentInfo'} — produced at SHIPPED but no downstream processor uses it
```

```rust
let dead: HashSet<TypeId> = graph.dead_data();
// Contains TypeId::of::<ShipmentInfo>() — produced at Shipped but never consumed
```

### `lifetime(type)`

**When to use:** You need to see where a data type first appears and where it is last consumed. Here, lifetime means those positions in the flow, rather than elapsed time.

```java
var lt = graph.lifetime(PaymentIntent.class);
// Lifetime(firstProduced=PAYMENT_PENDING, lastConsumed=CONFIRMED)
```

```typescript
const lt = graph.lifetime(PaymentIntent);
// {firstProduced: 'PAYMENT_PENDING', lastConsumed: 'CONFIRMED'}
```

```rust
let lt = graph.lifetime(&TypeId::of::<PaymentIntent>());
// Some((PaymentPending, Confirmed)) — (first_produced, last_consumed)
```

### `pruningHints()`

**When to use:** Context data is accumulating and you want candidates to review for removal at each state. Pruning means discarding data you no longer need; this method returns hints rather than deleting values.

```java
Map<S, Set<Class<?>>> hints = graph.pruningHints();
// {SHIPPED: [OrderRequest, PaymentIntent]} — safe to remove after SHIPPED
```

```typescript
const hints: Map<string, Set<string>> = graph.pruningHints();
// Map {'SHIPPED' => Set {'OrderRequest', 'PaymentIntent'}} — safe to remove after SHIPPED
```

```rust
let hints: HashMap<OrderState, HashSet<TypeId>> = graph.pruning_hints();
// {Shipped: {TypeId::of::<OrderRequest>(), TypeId::of::<PaymentIntent>()}} — safe to prune
```

### `impactOf(type)`

**When to use:** A data type is changing and you need the list of producers and consumers to review. `impactOf` groups both sides of that dependency for the selected type.

```java
var impact = graph.impactOf(PaymentIntent.class);
// producers: [OrderInit], consumers: [PaymentGuard]
```

```typescript
const impact = graph.impactOf(PaymentIntent);
// {producers: [{name: 'OrderInit', ...}], consumers: [{name: 'PaymentGuard', ...}]}
```

```rust
let (producers, consumers) = graph.impact_of(&TypeId::of::<PaymentIntent>());
// producers: [NodeInfo { name: "OrderInit", ... }], consumers: [NodeInfo { name: "PaymentGuard", ... }]
```

### `parallelismHints()`

**When to use:** You are reviewing whether two pieces of work have a declared data dependency. The result suggests pairs without such dependencies; it does not make the engine execute them concurrently.

```java
List<String[]> hints = graph.parallelismHints();
// [["RiskCheck", "AddressValidation"]] — no data dependency between them
```

```typescript
const hints: [string, string][] = graph.parallelismHints();
// [['RiskCheck', 'AddressValidation']] — no data dependency between them
```

```rust
let hints: Vec<(String, String)> = graph.parallelism_hints();
// [("RiskCheck", "AddressValidation")] — no data dependency between them
```

### `assertDataFlow(ctx, state)`

**When to use:** A test should detect values missing from the context at a particular state. Compare the instance with the data-flow expectations, then assert that the returned list of missing types is empty.

```java
List<Class<?>> missing = graph.assertDataFlow(flow.context(), flow.currentState());
assertTrue(missing.isEmpty(), "Missing types: " + missing);
```

```typescript
const missing: string[] = graph.assertDataFlow(flow.context, flow.currentState);
expect(missing).toEqual([]);
```

```rust
let missing: Vec<TypeId> = graph.assert_data_flow(&flow.context, flow.current_state());
assert!(missing.is_empty(), "Missing types: {:?}", missing);
```

### `verifyProcessor(processor, ctx)`

**When to use:** A Processor declares its inputs and outputs, but you need to test that the expected data is actually present. This helper executes the Processor and reports contract violations, including missing required inputs or missing declared outputs.

```java
List<String> violations = DataFlowGraph.verifyProcessor(orderInit, ctx);
// [] = OK, or ["put ShipmentInfo but did not declare it in produces()"]
```

```typescript
const violations: string[] = await DataFlowGraph.verifyProcessor(orderInit, ctx);
// [] = OK, or ['put ShipmentInfo but did not declare it in produces()']
```

```rust
let violations: Vec<String> = graph.verify_processor(&order_init, &mut ctx);
// [] = OK, or ["put ShipmentInfo but did not declare it in produces()"]
```

### `isCompatible(a, b)`

**When to use:** You want to replace a Processor without increasing its input requirements or removing outputs used elsewhere. Compatibility here concerns the declared data contract: B must require no more than A and produce at least what A produces.

```java
boolean ok = DataFlowGraph.isCompatible(orderInitV1, orderInitV2);
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

```typescript
const ok: boolean = DataFlowGraph.isCompatible(orderInitV1, orderInitV2);
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

```rust
let ok = DataFlowGraph::<OrderState>::is_compatible(
    v1.requires(), v1.produces(), v2.requires(), v2.produces());
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

### `migrationOrder()`

**When to use:** You are moving a flow to another language and need an implementation order that follows its data dependencies. The returned order puts producers before the steps that need their outputs.

```java
List<String> order = graph.migrationOrder();
// ["OrderInit", "PaymentGuard", "TokenExchange", ...] — dependency order
```

```typescript
const order: string[] = graph.migrationOrder();
// ['OrderInit', 'PaymentGuard', 'TokenExchange', ...] — dependency order
```

```rust
let order: Vec<String> = graph.migration_order();
// ["OrderInit", "PaymentGuard", "TokenExchange", ...] — topological dependency order
```

### `testScaffold()`

**When to use:** Writing a Processor test leaves you unsure which inputs to prepare. A scaffold is a starting point for test setup; this method lists required data types, whose sample values you supply yourself.

```java
Map<String, List<String>> scaffold = graph.testScaffold();
// {"OrderInit": ["OrderRequest"], "PaymentGuard": ["PaymentIntent"]}
```

```typescript
const scaffold: Map<string, string[]> = graph.testScaffold();
// Map {'OrderInit' => ['OrderRequest'], 'PaymentGuard' => ['PaymentIntent']}
```

```rust
let scaffold: HashMap<String, Vec<String>> = graph.test_scaffold();
// {"OrderInit": ["OrderRequest"], "PaymentGuard": ["PaymentIntent"]}
```

### `generateInvariantAssertions()`

**When to use:** Tests need a checklist of data that should exist at each state. An invariant is a condition that must hold there; this method returns those conditions as strings for use when writing assertions.

```java
List<String> assertions = graph.generateInvariantAssertions();
// ["At state CONFIRMED: context must contain [OrderRequest, PaymentIntent, PaymentResult]"]
```

```typescript
const assertions: string[] = graph.generateInvariantAssertions();
// ['At state CONFIRMED: context must contain [OrderRequest, PaymentIntent, PaymentResult]']
```

```rust
let assertions: Vec<String> = graph.generate_invariant_assertions();
// ["At state Confirmed: context must contain [OrderRequest, PaymentIntent, PaymentResult]"]
```

### `crossFlowMap(graphs...)`

**When to use:** Separate flows exchange data and you need to identify matching producers and consumers. The map reports types produced in one flow and required in another; it does not transfer the data.

```java
var deps = DataFlowGraph.crossFlowMap(orderGraph, refundGraph);
// ["ShipmentInfo: flow 0 produces → flow 1 consumes"]
```

```typescript
const deps: string[] = DataFlowGraph.crossFlowMap(orderGraph, refundGraph);
// ['ShipmentInfo: flow 0 produces → flow 1 consumes']
```

> **Note:** `crossFlowMap()` is currently Java/TypeScript only.

### `diff(before, after)`

**When to use:** A flow definition changed and a review needs a concrete summary of its data dependencies. Compare the graphs to identify additions and removals, using the result format shown for each language.

```java
var result = DataFlowGraph.diff(v1Graph, v2Graph);
// addedTypes: {FraudScore}, removedTypes: {}, addedEdges: {...}
```

```typescript
const result = DataFlowGraph.diff(v1Graph, v2Graph);
// {addedTypes: Set {'FraudScore'}, removedTypes: Set {}, addedEdges: Set {...}, ...}
```

```rust
let (added, removed) = DataFlowGraph::diff(&v1_graph, &v2_graph);
// added: ["FraudScore"], removed: [] — type-level additions/removals
```

### `versionCompatibility(v1, v2)`

**When to use:** You are updating a definition while older instances may still be waiting. Check for data that the new definition expects at a state but the old instances may lack before planning their migration.

```java
var issues = DataFlowGraph.versionCompatibility(v1Graph, v2Graph);
// ["State CONFIRMED: v2 expects FraudScore but v1 instances may not have it"]
```

```typescript
const issues: string[] = DataFlowGraph.versionCompatibility(v1Graph, v2Graph);
// ['State CONFIRMED: v2 expects FraudScore but v1 instances may not have it']
```

> **Note:** `versionCompatibility()` is currently Java/TypeScript only. In Rust, use `diff()` combined with `explain()` for migration analysis.

### `toMermaid()` / `toJson()` / `toMarkdown()`

**When to use:** You need to share the dependency analysis in documentation or consume it in another tool. Mermaid is a text format for diagrams, JSON provides structured data, and Markdown gives a readable checklist.

```java
String mermaid = graph.toMermaid();     // flowchart LR (Mermaid)
String json = graph.toJson();           // structured JSON for tooling
String md = graph.toMarkdown();         // migration checklist
```

```typescript
const mermaid: string = graph.toMermaid();   // flowchart LR (Mermaid)
const json: string = graph.toJson();         // structured JSON for tooling
const md: string = graph.toMarkdown();       // migration checklist
```

```rust
let mermaid: String = graph.to_mermaid();    // flowchart LR (Mermaid)
let json: String = graph.to_json();          // structured JSON for tooling
let md: String = graph.to_markdown();        // migration checklist
```

### `renderDataFlow(renderer)` / `toRenderable()`

**When to use:** Your documentation or UI needs a diagram format other than the built-in output. A renderer is a function that turns graph data into that format, such as Graphviz dot or PlantUML diagram text, or data for a D3.js visualization.

```java
// Graphviz dot
String dot = graph.renderDataFlow(g -> {
    var sb = new StringBuilder("digraph {\n");
    for (var edge : g.edges()) {
        sb.append("  \"").append(edge.from()).append("\" -> \"")
          .append(edge.to()).append("\" [label=\"").append(edge.kind()).append("\"];\n");
    }
    return sb.append("}").toString();
});
```

> **Note:** `renderDataFlow()` is Java-only. In TypeScript and Rust, use `toJson()` to get structured data and build custom renderers from the parsed JSON.

---

## FlowDefinition

Use a built definition to inspect the allowed routes or extend it with a child flow. The builder recipes above cover creating the original definition.

### `renderStateDiagram(renderer)`

**When to use:** You need to draw the allowed state transitions in your own format. A renderer receives the definition and converts its transitions to diagram text, such as Graphviz dot or PlantUML.

```java
String dot = definition.renderStateDiagram(d -> {
    var sb = new StringBuilder("digraph {\n");
    for (var t : d.transitions()) {
        sb.append("  ").append(t.from()).append(" -> ").append(t.to());
        if (!t.label().isEmpty()) sb.append(" [label=\"").append(t.label()).append("\"]");
        sb.append(";\n");
    }
    return sb.append("}").toString();
});
```

> **Note:** `renderStateDiagram()` is Java-only. In TypeScript, iterate `definition.transitions` directly. In Rust, use `graph.to_mermaid()` for Mermaid output or `graph.to_json()` for custom rendering.

```typescript
let dot = 'digraph {\n';
for (const t of definition.transitions) {
    dot += `  ${t.from} -> ${t.to}`;
    if (t.processor) dot += ` [label="${t.processor.name}"]`;
    dot += ';\n';
}
dot += '}';
```

```rust
// Use DataFlowGraph for diagram generation
let graph = def.data_flow_graph();
let mermaid = graph.to_mermaid();  // stateDiagram-v2 format
let json = graph.to_json();        // structured data for custom renderers
```

### `withPlugin(from, to, pluginFlow)`

**When to use:** A flow needs an extra process, such as gift wrapping before shipping. A plugin flow is a child flow inserted at a chosen transition; Java/TypeScript use `withPlugin`, while the Rust example declares the child in the builder.

```java
var extended = baseFlow.withPlugin(CONFIRMED, SHIPPED, giftWrappingFlow);
// CONFIRMED → [giftWrapping sub-flow] → SHIPPED
```

```typescript
const extended = baseFlow.withPlugin('CONFIRMED', 'SHIPPED', giftWrappingFlow);
// CONFIRMED → [giftWrapping sub-flow] → SHIPPED
```

```rust
// In Rust, use sub_flow() in the builder to embed child flows:
.from(Confirmed).sub_flow(Box::new(SubFlowAdapter::new(gift_wrapping_def)))
    .on_exit("DONE", Shipped)
    .end_sub_flow()
```

---

## Logging

Use logger callbacks to send execution events to your existing logs or monitoring tools. Choose the callback for the question you are investigating: progress, event validation, data writes, or failure.

### `setTransitionLogger(entry -> ...)`

**When to use:** You need to reconstruct the route an execution took. Register a logger callback to record the flow ID, source, destination, and transition trigger.

```java
engine.setTransitionLogger(entry ->
    log.info("[{}:{}] {} → {} ({})", entry.flowName(), entry.flowId(), entry.from(), entry.to(), entry.trigger()));
// [oidc:abc123] CREATED → PAYMENT_PENDING (OrderInit)
```

```typescript
engine.setTransitionLogger(entry =>
    console.log(`[${entry.flowName}:${entry.flowId}] ${entry.from} → ${entry.to} (${entry.trigger})`));
// [oidc:abc123] CREATED → PAYMENT_PENDING (OrderInit)
```

```rust
engine.set_transition_logger(|entry|
    println!("[{}:{}] {} → {} ({})", entry.flow_name, entry.flow_id, entry.from, entry.to, entry.trigger));
// [oidc:abc123] Created → PaymentPending (OrderInit)
```

### `setGuardLogger(entry -> ...)`

**When to use:** An external response arrived but the flow did not advance. Log the Guard result and reason to see whether the input was accepted or rejected.

```java
engine.setGuardLogger(entry ->
    log.info("[{}] guard {} at {}: {} ({})",
        entry.flowId(), entry.guardName(), entry.state(), entry.result(), entry.reason()));
// [abc123] guard PaymentGuard at PAYMENT_PENDING: rejected (Insufficient funds)
```

```typescript
engine.setGuardLogger(entry =>
    console.log(`[${entry.flowId}] guard ${entry.guardName} at ${entry.state}: ${entry.result} (${entry.reason})`));
// [abc123] guard PaymentGuard at PAYMENT_PENDING: rejected (Insufficient funds)
```

```rust
engine.set_guard_logger(|entry|
    println!("[{}] guard {} at {}: {} ({:?})",
        entry.flow_id, entry.guard_name, entry.state, entry.result, entry.reason));
// [abc123] guard PaymentGuard at PaymentPending: rejected (Some("Insufficient funds"))
```

### `setStateLogger(entry -> ...)`

**When to use:** A later step cannot find expected data and you need to trace context writes. The state logger reports data additions associated with the executing state.

```java
engine.setStateLogger(entry ->
    log.debug("[{}] {}: put {} ({})",
        entry.flowId(), entry.state(), entry.typeName(), entry.type()));
// [abc123] CREATED: put PaymentIntent (class com.example.PaymentIntent)
```

```typescript
engine.setStateLogger(entry =>
    console.debug(`[${entry.flowId}] ${entry.state}: put ${entry.key}`));
// [abc123] CREATED: put PaymentIntent
```

```rust
engine.set_state_logger(|entry|
    println!("[{}] {}: put data", entry.flow_id, entry.state));
```

### `setErrorLogger(entry -> ...)`

**When to use:** A flow failure should appear in application monitoring or notify an alerting service. Register a callback to send the error event to that service.

```java
engine.setErrorLogger(entry ->
    alertService.send("Flow error: " + entry.trigger() + " at " + entry.from()));
```

```typescript
engine.setErrorLogger(entry =>
    alertService.send(`Flow error: ${entry.trigger} at ${entry.from}`));
```

```rust
engine.set_error_logger(|entry|
    eprintln!("Flow error: {} at {} (cause: {:?})", entry.trigger, entry.from, entry.cause));
```

### `removeAllLoggers()`

**When to use:** A test or a particular execution environment should stop invoking the configured loggers. Remove all logger callbacks from the engine.

```java
engine.removeAllLoggers();
```

```typescript
engine.removeAllLoggers();
```

```rust
engine.remove_all_loggers();
```

---

## Pipeline

Use a Pipeline for a fixed sequence of steps with declared inputs and outputs. It checks dependencies without requiring a state enum or external-event transitions.

### `Tramli.pipeline(name).step(...).build()`

**When to use:** Work such as importing a CSV file always runs through the same sequence and never waits for an external event. Define Pipeline steps in order and call `build()` to check their data dependencies before execution.

```java
var pipeline = Tramli.pipeline("csv-import")
    .initiallyAvailable(RawInput.class)
    .step(parse).step(validate).step(enrich).step(save)
    .build();
FlowContext result = pipeline.execute(Map.of(RawInput.class, rawData));
```

```typescript
const pipeline = Tramli.pipeline('csv-import')
    .initiallyAvailable(RawInput)
    .step(parse).step(validate).step(enrich).step(save)
    .build();
const result = await pipeline.execute(Tramli.data([RawInput, rawData]));
```

```rust
let pipeline = PipelineBuilder::new("csv-import")
    .initially_available(requires![RawInput])
    .step(Box::new(parse)).step(Box::new(validate))
    .step(Box::new(enrich)).step(Box::new(save))
    .build()?;
let result = pipeline.execute(vec![
    (TypeId::of::<RawInput>(), Box::new(raw_data) as Box<dyn CloneAny>),
])?;
```

### `PipelineException`

**When to use:** A pipeline failed and you need to know which step failed and which steps completed. Java/TypeScript also expose the context containing partial results; Rust provides the step names and underlying error.

```java
try {
    pipeline.execute(data);
} catch (PipelineException e) {
    log.error("Failed at step '{}' after completing {}",
        e.failedStep(), e.completedSteps());
    // Partial results available via e.context()
}
```

```typescript
try {
    await pipeline.execute(data);
} catch (e) {
    if (e instanceof PipelineException) {
        console.error(`Failed at step '${e.failedStep}' after completing ${e.completedSteps}`);
        // Partial results available via e.context
    }
}
```

```rust
match pipeline.execute(data) {
    Err(e) => {
        eprintln!("Failed at step '{}' after completing {:?}", e.failed_step, e.completed_steps);
        // e.cause is a FlowError with the original error details
    }
    Ok(ctx) => { /* use result context */ }
}
```

### `pipeline.dataFlow().deadData()`

**When to use:** You want to review outputs that no downstream step declares as input. Check whether the caller uses those values as the pipeline result before treating them as unnecessary.

```java
Set<Class<?>> dead = pipeline.dataFlow().deadData();
// Types produced by a step but never required by downstream steps
```

```typescript
const dead: Set<string> = pipeline.dataFlow().deadData();
// Types produced by a step but never required by downstream steps
```

```rust
let dead: HashSet<TypeId> = pipeline.data_flow().dead_data();
// TypeIds produced by a step but never required by downstream steps
```

### `pipeline.asStep()`

**When to use:** A sequence already used elsewhere should become one step in a larger pipeline. `asStep()` adapts that pipeline to the step interface.

```java
PipelineStep auth = authPipeline.asStep();
var main = Tramli.pipeline("request")
    .step(auth)            // auth pipeline as a single step
    .step(processAction)
    .build();
```

```typescript
const auth = authPipeline.asStep();
const main = Tramli.pipeline('request')
    .step(auth)            // auth pipeline as a single step
    .step(processAction)
    .build();
```

> **Note:** `asStep()` is Java/TypeScript only. In Rust, wrap a `Pipeline` in a newtype (a wrapper struct) that implements `PipelineStep` to achieve the same composition.

### `pipeline.setStrictMode(true)`

**When to use:** Dependency checks pass, but a step implementation may forget to write its declared output. Strict mode checks at runtime that each step's declared outputs are present after it runs.

```java
pipeline.setStrictMode(true);
pipeline.execute(data);
// Throws PipelineException if a step doesn't put its declared produces
```

```typescript
pipeline.setStrictMode(true);
await pipeline.execute(data);
// Throws PipelineException if a step doesn't put its declared produces
```

```rust
pipeline.set_strict_mode(true);
pipeline.execute(data)?;
// Returns Err(PipelineError) if a step doesn't put its declared produces
```

---

## Code Generation

Use the definition as the source for diagrams and implementation templates. These recipes show what each generator produces; business logic still belongs in your Processors.

### `MermaidGenerator.generate(definition)`

**When to use:** A hand-maintained state diagram is falling behind changes to the definition. Generate Mermaid diagram text from the definition and include it in your documentation.

```java
String mermaid = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 format — paste into GitHub Markdown
```

```typescript
const mermaid: string = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 format — paste into GitHub Markdown
```

```rust
let mermaid: String = MermaidGenerator::generate(&oidc_def);
// stateDiagram-v2 format — paste into GitHub Markdown

// v1.8.0+: explicit view selection via MermaidView enum
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::State);
```

### `MermaidGenerator.generateDataFlow(definition)`

**When to use:** Reviewers need to see which steps supply the data that other steps read. Generate a diagram of the declared `requires` and `produces` relationships.

```java
String mermaid = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — shows which data flows between processors
```

```typescript
const mermaid: string = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — shows which data flows between processors
```

```rust
let mermaid: String = MermaidGenerator::generate_data_flow(&oidc_def);
// flowchart LR — shows which data flows between processors

// or via MermaidView
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::DataFlow);
```

### `MermaidGenerator.generateExternalContract(definition)`

**When to use:** Someone integrating an external callback needs to understand the data contract at that boundary. The diagram shows the Guard's required input and produced output, making those declarations visible.

```java
String mermaid = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

```typescript
const mermaid: string = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

### `SkeletonGenerator.generate(definition, language)`

**When to use:** You are implementing the same flow in another language and need the Processor declarations to start from. A skeleton is an implementation template; fill in its business logic after generation.

```java
String rust = SkeletonGenerator.generate(oidcFlow, Language.RUST);
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

```typescript
const rust: string = SkeletonGenerator.generate(oidcFlow, 'rust');
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

---

## FlowErrorType

**When to use:** Error handling must distinguish failures that may succeed on retry from failures that should stop the operation. `RETRYABLE` marks the former and `FATAL` the latter; Rust uses error-code strings and routing predicates instead of this enum.

```java
try {
    externalService.call();
} catch (SocketTimeoutException e) {
    throw new FlowException("TIMEOUT", "Service timed out", e)
        .withErrorType(FlowErrorType.RETRYABLE);
} catch (AuthenticationException e) {
    throw new FlowException("AUTH_FAILED", "Bad credentials", e)
        .withErrorType(FlowErrorType.FATAL);
}

// In error handler:
if (flow.lastError() != null) {
    // Route based on error type in onStepError
}
```

```typescript
try {
    await externalService.call();
} catch (e) {
    if (e instanceof TimeoutError) {
        throw new FlowError('TIMEOUT', 'Service timed out')
            .withErrorType('RETRYABLE');
    }
    throw new FlowError('AUTH_FAILED', 'Bad credentials')
        .withErrorType('FATAL');
}

// In error handler:
if (flow.lastError != null) {
    // Route based on error type in onStepError
}
```

```rust
// Rust has no FlowErrorType enum — use descriptive code strings instead.
// In a processor:
if timed_out {
    return Err(FlowError::with_source("TIMEOUT", "Service timed out", io_err));
}
return Err(FlowError::new("AUTH_FAILED", "Bad credentials"));

// In FlowDefinition — route by predicate on error code:
.on_step_error(TokenExchange, |e| e.code == "TIMEOUT", "Timeout", RetriableError)
.on_step_error(TokenExchange, |e| e.code == "AUTH_FAILED", "AuthFailed", TerminalError)
// Unmatched errors fall through to on_error / on_any_error
```
