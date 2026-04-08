# tramli API Cookbook

Practical examples for every tramli API. Each recipe shows **when to use it** and **how**.

---

## FlowDefinition Builder

### `from(state).auto(to, processor)`

When: Internal processing that runs immediately after the previous step.

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit runs → PAYMENT_PENDING
```

### `from(state).external(to, guard)`

When: Waiting for an outside event (HTTP callback, webhook, user action).

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// Flow stops at PAYMENT_PENDING until resumeAndExecute() is called
```

### `from(state).external(to, guard, timeout)`

When: External wait with a deadline. If no event arrives in time, flow expires.

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
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

### `from(state).subFlow(def).onExit("X", s).endSubFlow()`

When: Embedding a child flow inside a parent flow.

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
    .endSubFlow()
// paymentDetailFlow runs inside PAYMENT state, then maps terminal → parent state
```

### `.onError(from, to)`

When: Routing a specific state's errors to a specific error state.

```java
.onError(TOKEN_EXCHANGE, RETRIABLE_ERROR)
// If TokenExchange throws → RETRIABLE_ERROR (not the default error state)
```

### `.onStepError(from, ExceptionClass, to)`

When: Different exception types need different error handling.

```java
.onStepError(TOKEN_EXCHANGE, HttpTimeoutException.class, RETRIABLE_ERROR)
.onStepError(TOKEN_EXCHANGE, InvalidTokenException.class, TERMINAL_ERROR)
// Timeout → retry, invalid token → fatal. Unmatched → onError fallback
```

### `.onAnyError(state)`

When: Catch-all error routing for all non-terminal states.

```java
.onAnyError(CANCELLED)
// Any unhandled error from any state → CANCELLED
```

### `.initiallyAvailable(types...)`

When: Declaring what data is provided at `startFlow()`.

```java
.initiallyAvailable(OrderRequest.class)
// build() verifies the first processor's requires() is satisfied by this
```

### `.ttl(duration)`

When: Setting the flow's global time-to-live.

```java
.ttl(Duration.ofHours(24))
// Flow expires after 24 hours regardless of state
```

### `.maxGuardRetries(n)`

When: Limiting how many times a guard can reject before routing to error.

```java
.maxGuardRetries(3)
// After 3 rejections → error transition
```

### `.build()`

When: Always. Validates 8+ structural checks and builds the DataFlowGraph.

```java
var def = builder.build();
// Throws FlowException with actionable error messages if invalid
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

---

## FlowEngine

### `startFlow(definition, sessionId, initialData)`

When: Starting a new flow instance.

```java
var flow = engine.startFlow(oidcFlow, "session-123",
    Map.of(OidcRequest.class, new OidcRequest("GOOGLE", "/")));
// Auto-chain fires: INIT → REDIRECTED (stops at External)
```

### `resumeAndExecute(flowId, definition, externalData)`

When: An external event arrives (callback, webhook, user action).

```java
flow = engine.resumeAndExecute(flow.id(), oidcFlow,
    Map.of(OidcCallback.class, new OidcCallback("auth-code", "state")));
// Guard validates → auto-chain fires → COMPLETE
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

### `lastError()`

When: Inspecting what went wrong after an error transition.

```java
if (flow.currentState() == ERROR) {
    log.error("Flow failed: {}", flow.lastError());
    // "HttpTimeoutException: Connection timed out"
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

### `statePath()` / `statePathString()`

When: Getting the full hierarchical state for logging/UI.

```java
log.info("Flow at: {}", flow.statePathString());
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

### `waitingFor()`

When: Telling the client what data to send for the next external transition.

```java
Set<Class<?>> needed = flow.waitingFor();
// {OidcCallback.class} — client needs to send OAuth callback data
```

### `availableData()`

When: Checking what data is in context at the current state.

```java
Set<Class<?>> available = flow.availableData();
// {OidcRequest, OidcRedirect} — what's been produced so far
```

### `missingFor()`

When: Debugging why a transition can't proceed.

```java
Set<Class<?>> missing = flow.missingFor();
// {PaymentResult} — this type is required but not yet in context
```

### `withVersion(n)` / `setVersionPublic(n)` (Rust)

When: FlowStore optimistic locking — update version after save.

```java
// After SQL UPDATE ... SET version = version + 1
flow = flow.withVersion(flow.version() + 1);
```

### `stateEnteredAt()`

When: Checking when the current state was entered (for per-state timeout).

```java
Instant entered = flow.stateEnteredAt();
Duration elapsed = Duration.between(entered, Instant.now());
log.info("Waiting for {} seconds", elapsed.getSeconds());
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

---

## DataFlowGraph

### `availableAt(state)`

When: "What data is available when the flow reaches state X?"

```java
Set<Class<?>> available = graph.availableAt(PAYMENT_CONFIRMED);
// {OrderRequest, PaymentIntent, PaymentResult}
```

### `producersOf(type)` / `consumersOf(type)`

When: "Who creates/uses this data type?"

```java
graph.producersOf(PaymentIntent.class);
// [{name: "OrderInit", from: CREATED, to: PAYMENT_PENDING}]

graph.consumersOf(PaymentIntent.class);
// [{name: "PaymentGuard", from: PAYMENT_PENDING, to: CONFIRMED}]
```

### `deadData()`

When: Finding data types that are produced but never consumed.

```java
Set<Class<?>> dead = graph.deadData();
// {ShipmentInfo} — produced at SHIPPED but no downstream processor uses it
```

### `lifetime(type)`

When: Understanding a data type's lifecycle across the flow.

```java
var lt = graph.lifetime(PaymentIntent.class);
// Lifetime(firstProduced=PAYMENT_PENDING, lastConsumed=CONFIRMED)
```

### `pruningHints()`

When: Optimizing memory — finding types no longer needed at each state.

```java
Map<S, Set<Class<?>>> hints = graph.pruningHints();
// {SHIPPED: [OrderRequest, PaymentIntent]} — safe to remove after SHIPPED
```

### `impactOf(type)`

When: "If I change this type, what processors are affected?"

```java
var impact = graph.impactOf(PaymentIntent.class);
// producers: [OrderInit], consumers: [PaymentGuard]
```

### `parallelismHints()`

When: Finding processors that could theoretically run in parallel.

```java
List<String[]> hints = graph.parallelismHints();
// [["RiskCheck", "AddressValidation"]] — no data dependency between them
```

### `assertDataFlow(ctx, state)`

When: Testing that a flow instance's context matches expectations.

```java
List<Class<?>> missing = graph.assertDataFlow(flow.context(), flow.currentState());
assertTrue(missing.isEmpty(), "Missing types: " + missing);
```

### `verifyProcessor(processor, ctx)`

When: Testing that a processor's actual get/put matches its declarations.

```java
List<String> violations = DataFlowGraph.verifyProcessor(orderInit, ctx);
// [] = OK, or ["put ShipmentInfo but did not declare it in produces()"]
```

### `isCompatible(a, b)`

When: Checking if processor B can replace processor A.

```java
boolean ok = DataFlowGraph.isCompatible(orderInitV1, orderInitV2);
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

### `migrationOrder()`

When: Planning cross-language migration — which processor to port first.

```java
List<String> order = graph.migrationOrder();
// ["OrderInit", "PaymentGuard", "TokenExchange", ...] — dependency order
```

### `testScaffold()`

When: Generating test setup — what data each processor needs.

```java
Map<String, List<String>> scaffold = graph.testScaffold();
// {"OrderInit": ["OrderRequest"], "PaymentGuard": ["PaymentIntent"]}
```

### `generateInvariantAssertions()`

When: Generating test assertions from data-flow invariants.

```java
List<String> assertions = graph.generateInvariantAssertions();
// ["At state CONFIRMED: context must contain [OrderRequest, PaymentIntent, PaymentResult]"]
```

### `crossFlowMap(graphs...)`

When: Finding data dependencies between multiple flows.

```java
var deps = DataFlowGraph.crossFlowMap(orderGraph, refundGraph);
// ["ShipmentInfo: flow 0 produces → flow 1 consumes"]
```

### `diff(before, after)`

When: PR review — what changed between two versions of a flow.

```java
var result = DataFlowGraph.diff(v1Graph, v2Graph);
// addedTypes: {FraudScore}, removedTypes: {}, addedEdges: {...}
```

### `versionCompatibility(v1, v2)`

When: Checking if running v1 instances can resume on v2 definition.

```java
var issues = DataFlowGraph.versionCompatibility(v1Graph, v2Graph);
// ["State CONFIRMED: v2 expects FraudScore but v1 instances may not have it"]
```

### `toMermaid()` / `toJson()` / `toMarkdown()`

When: Generating documentation/diagrams.

```java
String mermaid = graph.toMermaid();     // flowchart LR (Mermaid)
String json = graph.toJson();           // structured JSON for tooling
String md = graph.toMarkdown();         // migration checklist
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

### `withPlugin(from, to, pluginFlow)`

When: Inserting a sub-flow before an existing transition (plugin system).

```java
var extended = baseFlow.withPlugin(CONFIRMED, SHIPPED, giftWrappingFlow);
// CONFIRMED → [giftWrapping sub-flow] → SHIPPED
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

### `setGuardLogger(entry -> ...)`

When: Debugging guard acceptance/rejection.

```java
engine.setGuardLogger(entry ->
    log.info("[{}] guard {} at {}: {} ({})",
        entry.flowId(), entry.guardName(), entry.state(), entry.result(), entry.reason()));
// [abc123] guard PaymentGuard at PAYMENT_PENDING: rejected (Insufficient funds)
```

### `setStateLogger(entry -> ...)`

When: Debugging what data flows through context.

```java
engine.setStateLogger(entry ->
    log.debug("[{}] {}: put {} ({})",
        entry.flowId(), entry.state(), entry.typeName(), entry.type()));
// [abc123] CREATED: put PaymentIntent (class com.example.PaymentIntent)
```

### `setErrorLogger(entry -> ...)`

When: Alerting on flow errors.

```java
engine.setErrorLogger(entry ->
    alertService.send("Flow error: " + entry.trigger() + " at " + entry.from()));
```

### `removeAllLoggers()`

When: Disabling all logging (e.g., in tests).

```java
engine.removeAllLoggers();
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

### `pipeline.dataFlow().deadData()`

When: Finding unused pipeline outputs.

```java
Set<Class<?>> dead = pipeline.dataFlow().deadData();
// Types produced by a step but never required by downstream steps
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

### `pipeline.setStrictMode(true)`

When: Verifying that steps actually produce what they declare.

```java
pipeline.setStrictMode(true);
pipeline.execute(data);
// Throws PipelineException if a step doesn't put its declared produces
```

---

## Code Generation

### `MermaidGenerator.generate(definition)`

When: Generating a state transition diagram for docs/README.

```java
String mermaid = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 format — paste into GitHub Markdown
```

### `MermaidGenerator.generateDataFlow(definition)`

When: Generating a data-flow diagram showing requires/produces.

```java
String mermaid = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — shows which data flows between processors
```

### `MermaidGenerator.generateExternalContract(definition)`

When: Documenting what data external clients must send/receive.

```java
String mermaid = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

### `SkeletonGenerator.generate(definition, language)`

When: Generating processor skeletons for cross-language migration.

```java
String rust = SkeletonGenerator.generate(oidcFlow, Language.RUST);
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
