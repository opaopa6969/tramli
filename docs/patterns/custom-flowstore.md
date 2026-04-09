# Custom FlowStore 実装ガイド (Rust)

tramli v3.6.0 で `FlowStore` trait が追加されました。この trait を実装するだけで FlowEngine と統合できます。

## FlowStore trait

```rust
pub trait FlowStore<S: FlowState> {
    fn create(&mut self, flow: FlowInstance<S>);
    fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>>;
    fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>>;
    fn record_transition(&mut self, flow_id: &str, from: &str, to: &str, trigger: &str);
    fn transition_log(&self) -> &[TransitionRecord];
    fn clear(&mut self);
}
```

**この trait だけ実装すれば FlowEngine が動作します。** InMemoryFlowStore の内部 API を揃える必要はありません。

## 実装例: AuditingStore

tramli-plugins の `AuditingStore` は FlowStore を実装しています:

```rust
use tramli::{FlowStore, FlowInstance, TransitionRecord, FlowState, InMemoryFlowStore};

pub struct AuditingStore<S: FlowState> {
    delegate: InMemoryFlowStore<S>,
    audit_log: Vec<AuditedTransitionRecord>,
}

impl<S: FlowState> FlowStore<S> for AuditingStore<S> {
    fn create(&mut self, flow: FlowInstance<S>) { self.delegate.create(flow); }
    fn get(&self, flow_id: &str) -> Option<&FlowInstance<S>> { self.delegate.get(flow_id) }
    fn get_mut(&mut self, flow_id: &str) -> Option<&mut FlowInstance<S>> { self.delegate.get_mut(flow_id) }
    fn record_transition(&mut self, flow_id: &str, from: &str, to: &str, trigger: &str) {
        self.delegate.record_transition(flow_id, from, to, trigger);
        self.audit_log.push(/* ... */);
    }
    fn transition_log(&self) -> &[TransitionRecord] { self.delegate.transition_log() }
    fn clear(&mut self) { self.delegate.clear(); self.audit_log.clear(); }
}
```

## SqlFlowStore を作る場合

DB 永続化の FlowStore を作る場合のポイント:

1. **`get_mut()` はライフタイム制約がある** — `&mut self` から `&mut FlowInstance` を返す必要があるため、DB から読んだインスタンスをキャッシュする設計が必要
2. **`record_transition()` は DB INSERT** — FlowEngine が遷移ごとに呼び出す
3. **`transition_log()` は `&[TransitionRecord]` を返す** — 全ログを Vec で保持するか、空スライスを返して別の query API を提供する

## Async Store について

tramli の FlowEngine は同期設計です。async DB クライアント (sqlx 等) を使う場合は `block_on` パターンを使ってください:

```rust
fn create(&mut self, flow: FlowInstance<S>) {
    self.runtime.block_on(async {
        sqlx::query("INSERT INTO flows ...")
            .execute(&self.pool).await.unwrap();
    });
    self.cache.insert(flow.id.clone(), flow);
}
```

詳細は [docs/patterns/io-separation.md](io-separation.md) を参照してください。
