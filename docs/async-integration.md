# Async Integration Guide — tramli + async I/O

tramli is intentionally **synchronous**. It makes judgments (state transitions) in microseconds.
Async I/O (HTTP calls, DB queries) happens **outside** the SM engine.

## The Pattern: sync judgment + async execution

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  SM start() │────►│  async I/O   │────►│ SM resume()  │
│  (sync, μs) │     │ (volta HTTP) │     │  (sync, μs)  │
│  RECEIVED → │     │              │     │ AUTH_CHECKED →│
│  → ROUTED   │     │              │     │ → FORWARDED  │
└─────────────┘     └──────────────┘     └─────────────┘
```

### Why not async SM?

1. **Complexity**: async traits, pinning, lifetime issues — for ~2μs of work
2. **Testability**: sync processors are trivially testable without async runtime
3. **Portability**: sync code works everywhere (WASM, embedded, etc.)

### How to use with async runtimes

```rust
// tokio example
async fn handle_request(engine: &FlowEngine, req: Request) -> Response {
    // 1. Start flow (sync — microseconds)
    let flow = engine.start_flow(&definition, None, initial_data);
    // SM auto-chains: RECEIVED → VALIDATED → ROUTED (stops at External)

    // 2. Async I/O outside SM
    let auth_result = volta_client.check_auth(&req).await;

    // 3. Resume flow with result (sync — microseconds)  
    let flow = engine.resume_and_execute(flow.id(), &definition, auth_data);
    // SM auto-chains: AUTH_CHECKED → (stops at next External)

    // 4. More async I/O
    let backend_response = backend_client.forward(&req).await;

    // 5. Resume again (sync — microseconds)
    let flow = engine.resume_and_execute(flow.id(), &definition, response_data);
    // SM auto-chains: FORWARDED → RESPONSE_RECEIVED → COMPLETED

    // 6. Extract result
    flow.context().get::<ProxyResponse>()
}
```

### Key rules

- **SM never blocks**: all processors must be sync and fast (no I/O)
- **External transitions are async boundaries**: each External = one async I/O call
- **FlowContext carries data across boundaries**: auth result goes in, response comes out
- **Multiple External transitions are fine**: design your flow with one per async operation

### volta-gateway example

```
Flow: RECEIVED → VALIDATED → ROUTED → [External] → AUTH_CHECKED → [External] → FORWARDED → COMPLETED
                                       ↑ volta call                ↑ backend call

Two External transitions = two async boundaries = two resume() calls.
SM stays sync. Async lives in the tower::Service implementation.
```
