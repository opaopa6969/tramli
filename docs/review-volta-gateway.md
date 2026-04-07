[日本語版](review-volta-gateway-ja.md)

# User Review: tramli-rust in volta-gateway

> Reviewer: Claude Opus 4.6 (as implementation partner)
> Project: [volta-gateway](https://github.com/opaopa6969/volta-gateway) — Rust reverse proxy using tramli SM engine
> Date: 2026-04-07
> tramli version: 0.1.0 (crates.io)

## Context

Built a reverse proxy that replaces Traefik. Used tramli to drive the request lifecycle:

```
RECEIVED → VALIDATED → ROUTED → [auth] → AUTH_CHECKED → [forward] → FORWARDED → COMPLETED
```

6 states, 5 terminals, 4 processors, 2 guards. E2E verified with volta-auth-proxy.

---

## What worked well

### 1. build() is a safety net

Wrote flow.rs in 30 minutes. Never worried about "did I wire the requires/produces correctly?" because `build()` would reject it immediately if wrong. The feedback loop is:

```
write flow → cargo check → build() panics with clear message → fix → done
```

No runtime surprises. The 8-item validation caught a missing `initially_available` on the first try.

### 2. get() → Result vs find() → Option

This distinction is perfect:

```rust
// Processor: "RequestData MUST be here" (set at start_flow)
let req = ctx.get::<RequestData>()?;

// Guard: "AuthData MIGHT be here" (set externally between resume calls)
match ctx.find::<AuthData>() {
    Some(data) => GuardOutput::Accepted { ... },
    None => GuardOutput::Rejected { ... },
}
```

`get()` for invariants, `find()` for external input. Never confused which to use.

### 3. Sync design is right for Rust

After reading `ASYNC_STACK_ISSUE.md`, the sync decision is clearly correct. The B-pattern (sync SM + async I/O outside) mapped naturally to the proxy:

```rust
let flow_id = engine.start_flow(...)?;           // sync, ~1μs
let auth = volta_client.check_auth(&req).await;  // async, outside SM
engine.resume_and_execute(&flow_id, auth_data)?;  // sync, ~300ns
let resp = backend.forward(&req).await;           // async, outside SM  
engine.resume_and_execute(&flow_id, resp_data)?;  // sync, ~300ns
```

SM never touches async. Async never touches SM. Clean separation.

### 4. Builder DSL reads like a spec

```rust
Builder::new("proxy")
    .from(Received).auto(Validated, RequestValidator { routing })
    .from(Validated).auto(Routed, RoutingResolver { routing })
    .from(Routed).external(AuthChecked, AuthGuard)
    .from(AuthChecked).external(Forwarded, ForwardGuard)
    .from(Forwarded).auto(Completed, CompletionProcessor)
    .on_any_error(BadGateway)
    .build()
```

This IS the spec. Anyone reading this knows the entire request lifecycle in 8 lines. No need to read proxy.rs, auth.rs, or any other file to understand the structure.

### 5. Transition log for free

```json
{"state":"COMPLETED", "transitions":5, "duration_ms":13}
```

Every SM transition is recorded in `InMemoryFlowStore`. Got per-request observability without writing any logging code in the processors.

---

## What could be better

### 1. GuardOutput::Accepted boilerplate

Building the `HashMap<TypeId, Box<dyn CloneAny>>` for Accepted data is verbose:

```rust
// Current: 4 lines for 1 field
GuardOutput::Accepted {
    data: {
        let mut m = HashMap::new();
        m.insert(TypeId::of::<AuthData>(), Box::new(data.clone()) as Box<dyn CloneAny>);
        m
    },
}
```

A macro would help:

```rust
// Ideal
GuardOutput::accepted![AuthData => data.clone()]

// Or a helper method
GuardOutput::accept_one::<AuthData>(data.clone())
```

### 2. Per-request FlowEngine allocation

For the proxy use case, I create a new `FlowEngine<ProxyState>` + `InMemoryFlowStore` per request. The HashMap allocates and deallocates each time. At ~2μs this is fine, but for 100K+ req/sec:

- Option A: shared FlowEngine with flow_id isolation (current design supports this)
- Option B: object pool for FlowEngine instances
- Option C: arena allocator for FlowContext

Not a problem today. Worth noting for high-throughput users.

### 3. Processor trait requires Send + Sync

`RequestValidator` holds `Arc<RoutingTable>`, which is `Send + Sync`. Fine. But if a processor needs a non-Send dependency (e.g., `Rc<RefCell<T>>`), it can't implement the trait. This is intentional (SM should be thread-safe), but documenting this constraint would help.

---

## Performance

```
SM overhead per request:
  start_flow:           ~1μs (3 auto transitions: RECEIVED → VALIDATED → ROUTED)
  resume (auth):        ~300ns (1 external transition)
  resume (forward):     ~300ns (1 external + 1 auto transition)
  Total SM:             ~1.6μs

For comparison:
  volta auth HTTP call:  ~500μs (localhost)
  Backend HTTP call:     ~1-50ms
  SM / total:            0.003% — 0.16%
```

Unmeasurable in practice. The SM adds structure, not latency.

---

## Verdict

**Would use again.** The "build() catches mistakes" property turned what could have been a day of debugging into 30 minutes of confident coding. The sync design is exactly right for Rust.

The main value isn't performance (it's already negligible). It's **confidence** — knowing that if `build()` passes, the flow is structurally correct. In a reverse proxy where security matters, that's worth everything.
