# tramli

Constrained flow engine for Rust. State machines that prevent invalid transitions at build time.

## Features

- **Build-time validation** — reachability, DAG check, requires/produces data-flow analysis
- **Zero external dependencies**
- **Intentionally synchronous** — state transitions take microseconds; async I/O happens outside the engine
- **Type-safe context** — `FlowContext` stores data keyed by `TypeId` with compile-time safety
- **Data-flow graph** — automatic data dependency analysis via `def.data_flow_graph()`
- **Mermaid generation** — state diagram + data-flow diagram from code

## Quick start

以下はそのまま `src/main.rs` に貼り付けられる例です。`Processing` で外部イベントを待ち、
`resume_and_execute` の呼び出しで `Done` に進みます。

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

// この例では再開イベントを常に受理する純粋な guard を使う。
struct CompletionGuard;
impl TransitionGuard<OrderState> for CompletionGuard {
    fn name(&self) -> &str { "CompletionGuard" }
    fn requires(&self) -> Vec<TypeId> { vec![] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted { data: guard_data![] }
    }
}

fn main() {
    let def = Arc::new(Builder::new("order")
        .ttl(Duration::from_secs(300))
        .from(OrderState::Created).auto(OrderState::Processing, MyProcessor)
        .from(OrderState::Processing).external(OrderState::Done, CompletionGuard)
        .build()
        .unwrap());

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let flow_id = engine.start_flow(def, "session-1", vec![]).unwrap();
    let waiting = engine.store.get(&flow_id).unwrap();
    assert_eq!(waiting.current_state(), OrderState::Processing);
    assert!(!waiting.is_completed());

    engine.resume_and_execute(&flow_id, vec![]).unwrap();
    let completed = engine.store.get(&flow_id).unwrap();
    assert_eq!(completed.current_state(), OrderState::Done);
    assert!(completed.is_completed());
}
```

この README は crate の API ドキュメントにも使われます。上のコードと状態遷移の検証は
`cargo test --doc`（通常の `cargo test` にも含まれます）で実行できます。

## Design

- Sync core with external async wrapper pattern (see [async integration](https://github.com/opaopa6969/tramli/blob/main/docs/async-integration.md))
- Part of the [tramli](https://github.com/opaopa6969/tramli) multi-language flow engine family (Java, TypeScript, Rust)

## License

MIT
