# tramli API Cookbook

Practical examples for every tramli API. Each recipe shows **when to use it** and **how**.

> Examples are shown in **Java**, **TypeScript**, and **Rust**.
> Key TS differences: string-based `flowKey<T>()` instead of `Class<?>`, `async/await` for engine methods, milliseconds instead of `Duration`.
> Key Rust differences: `TypeId`-based context (`ctx.get::<T>()` instead of `ctx.get(T.class)`), `requires![]` macro for type lists, closures for callbacks, `Arc<FlowDefinition<S>>` for thread-safe sharing.

---

## Rust: Implementing Processors, Guards, and Branches

In Rust, processors, guards, and branches are **traits** implemented on structs — not interface objects or plain closures.

### `StateProcessor<S>` (Auto transitions)

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

### `from(state).auto(to, processor)`

When: Internal processing that runs immediately after the previous step.

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

When: Waiting for an outside event (HTTP callback, webhook, user action).

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

When: External wait with a deadline. If no event arrives in time, flow expires.

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

When: Conditional routing based on context data.

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

When: Embedding a child flow inside a parent flow.

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

When: Routing a specific state's errors to a specific error state.

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

When: Different exception types need different error handling.

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

When: Catch-all error routing for all non-terminal states.

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

When: Declaring what data is provided at `startFlow()`.

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

When: Setting the flow's global time-to-live.

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

When: Limiting how many times a guard can reject before routing to error.

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

When: Running side-effects when entering or exiting a specific state.

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

When: Always. Validates 8+ structural checks and builds the DataFlowGraph.

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

When: Checking structural warnings after build (e.g., liveness risk).

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

### `startFlow(definition, sessionId, initialData)`

When: Starting a new flow instance.

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

When: An external event arrives (callback, webhook, user action).

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

### `currentState()`

When: Checking where the flow is right now.

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

When: Checking if the flow is done and how it ended.

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

When: Inspecting what went wrong after an error transition.

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

When: Checking if the flow is inside a sub-flow.

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

When: Getting the full hierarchical state for logging/UI.

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

When: Telling the client what data to send for the next external transition.

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

When: Checking what data is in context at the current state.

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

When: Debugging why a transition can't proceed.

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

### `withVersion(n)` / `setVersionPublic(n)` (Rust)

When: FlowStore optimistic locking — update version after save.

```java
// After SQL UPDATE ... SET version = version + 1
flow = flow.withVersion(flow.version() + 1);
```

```typescript
// After SQL UPDATE ... SET version = version + 1
const updated = flow.withVersion(flow.version + 1);
```

```rust
// version() returns the current optimistic lock version
let v = flow.version();
// set_version_public() is available to FlowStore implementations (pub(crate))
```

### `stateEnteredAt()`

When: Checking when the current state was entered (for per-state timeout).

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

### `get(key)` / `find(key)` / `put(key, value)` / `has(key)`

When: Reading/writing typed data in processors.

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

When: Serializing FlowContext to JSON for database persistence.

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

### `availableAt(state)`

When: "What data is available when the flow reaches state X?"

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

When: "Who creates/uses this data type?"

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

When: Finding data types that are produced but never consumed.

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

When: Understanding a data type's lifecycle across the flow.

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

When: Optimizing memory — finding types no longer needed at each state.

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

When: "If I change this type, what processors are affected?"

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

When: Finding processors that could theoretically run in parallel.

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

When: Testing that a flow instance's context matches expectations.

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

When: Testing that a processor's actual get/put matches its declarations.

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

When: Checking if processor B can replace processor A.

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

When: Planning cross-language migration — which processor to port first.

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

When: Generating test setup — what data each processor needs.

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

When: Generating test assertions from data-flow invariants.

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

When: Finding data dependencies between multiple flows.

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

When: PR review — what changed between two versions of a flow.

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

When: Checking if running v1 instances can resume on v2 definition.

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

When: Generating documentation/diagrams.

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

When: Custom rendering (Graphviz dot, PlantUML, D3.js).

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

### `renderStateDiagram(renderer)`

When: Custom state diagram rendering (Graphviz, PlantUML).

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

When: Inserting a sub-flow before an existing transition (plugin system).

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

### `setTransitionLogger(entry -> ...)`

When: Logging every state transition.

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

When: Debugging guard acceptance/rejection.

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

When: Debugging what data flows through context.

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

When: Alerting on flow errors.

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

When: Disabling all logging (e.g., in tests).

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

### `Tramli.pipeline(name).step(...).build()`

When: Sequential processing without states or external events.

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

When: Handling step failures with full context.

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

When: Finding unused pipeline outputs.

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

When: Nesting one pipeline inside another.

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

> **Note:** `asStep()` is Java/TypeScript only. In Rust, wrap a `Pipeline` in a newtype that implements `PipelineStep` to achieve the same composition.

### `pipeline.setStrictMode(true)`

When: Verifying that steps actually produce what they declare.

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

### `MermaidGenerator.generate(definition)`

When: Generating a state transition diagram for docs/README.

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

When: Generating a data-flow diagram showing requires/produces.

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

When: Documenting what data external clients must send/receive.

```java
String mermaid = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

```typescript
const mermaid: string = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

### `SkeletonGenerator.generate(definition, language)`

When: Generating processor skeletons for cross-language migration.

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

When: Classifying errors for retry/recovery strategy.

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
