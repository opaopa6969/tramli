# tramli

Constrained flow engine for Rust. State machines that prevent invalid transitions at build time.

## Features

- **Build-time validation** — reachability, DAG check, requires/produces data-flow analysis
- **Zero external dependencies**
- **Intentionally synchronous** — state transitions take microseconds; async I/O happens outside the engine
- **Type-safe context** — `FlowContext` stores data keyed by `TypeId` with compile-time safety

## Quick start

```rust
use std::any::TypeId;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum OrderState { Created, Processing, Done }

impl FlowState for OrderState {
    fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
    fn is_initial(&self) -> bool { matches!(self, Self::Created) }
    fn all_states() -> &'static [Self] { &[Self::Created, Self::Processing, Self::Done] }
}

// Define a processor
struct MyProcessor;
impl StateProcessor<OrderState> for MyProcessor {
    fn name(&self) -> &str { "MyProcessor" }
    fn requires(&self) -> Vec<TypeId> { vec![] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> { Ok(()) }
}

// Build and run
let def = Arc::new(Builder::new("order")
    .ttl(Duration::from_secs(300))
    .from(OrderState::Created).auto(OrderState::Processing, MyProcessor)
    .from(OrderState::Processing).external(OrderState::Done, /* guard */)
    .build()
    .unwrap());

let mut engine = FlowEngine::new(InMemoryFlowStore::new());
let flow_id = engine.start_flow(def, "session-1", vec![]).unwrap();
```

## Design

- Sync core with external async wrapper pattern (see `docs/async-integration.md`)
- Part of the [tramli](https://github.com/opaopa6969/tramli) multi-language flow engine family (Java, TypeScript, Rust)

## License

MIT
