# Custom FlowStore 実装ガイド (Rust)

Rust でフローの保存先を差し替えたい人や、遷移に監査記録を追加したい人向けのガイドです。
`FlowStore` の実装方法と、DB を使う場合に必要なキャッシュ・version 管理を説明します。

## 問題: フローの保存方法を変えたい

`InMemoryFlowStore` はフローをメモリに保持します。テストには便利ですが、プロセスを終了すると保存内容は失われます。
DB に保存したい場合や、どの遷移が起きたかを監査用に記録したい場合は、アプリケーションに合った store が必要です。

## 素朴に実装するとどうなるか

各 Processor に保存処理を追加すると、業務処理と保存方法が混ざります。保存先を変えるために複数の Processor を修正することになり、遷移の記録漏れも確認しなければなりません。
`InMemoryFlowStore` の内部実装をそのままコピーすると、エンジンが必要としていない部分まで保守することになります。

## このパターン: FlowStore を実装して差し替える

tramli v3.6.0 で追加された `FlowStore` trait は、エンジンが store に求める操作を定義しています。
この trait を実装すれば `FlowEngine` に渡せます。`InMemoryFlowStore` の内部 API を揃える必要はありません。
監査だけを追加するなら、既存の store に通常の操作を委譲し、遷移を記録する操作に監査処理を追加できます。

## コード例

### FlowStore trait

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

### 実装例: AuditingStore

`tramli-plugins` の `AuditingStore` は、保存を `InMemoryFlowStore` に任せ、遷移を監査用のリストにも記録します。
以下はその構造を示す抜粋です。`AuditedTransitionRecord` の定義、監査レコードの組み立て、コンストラクタ、参照用メソッドは省略しています。

```rust
use tramli::{FlowEngine, FlowStore, FlowInstance, TransitionRecord, FlowState, InMemoryFlowStore};

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

`FlowEngine` は store の型を推論します。従来の `FlowEngine<S>` はデフォルトの `InMemoryFlowStore<S>` を指すため、既存コードとの互換性も維持されます。
次の例は、最初の自動遷移が1回起きるフローを使った場合です。

```rust
let store = AuditingStore::new(InMemoryFlowStore::new());
let mut engine = FlowEngine::new(store);
let flow_id = engine.start_flow(definition, "session-1", initial_data)?;

assert_eq!(engine.store.audited_transitions().len(), 1);
```

### SqlFlowStore を作る場合

trait を実装するだけで、DB への書き込みやトランザクション管理が自動で追加されるわけではありません。DB を使う store では、次の点を設計します。

1. `get()` と `get_mut()` は store が保持する `FlowInstance` への参照を返します。特に `get_mut()` は `&mut self` から `&mut FlowInstance` を返すため、DB から読み込んだインスタンスをキャッシュする必要があります。
2. `record_transition()` はエンジンが遷移ごとに呼び出します。遷移ログの DB INSERT をここで行えます。キャッシュ上の状態を DB に反映するタイミングも store 側で決めます。
3. `transition_log()` は `&[TransitionRecord]` を返します。全ログを `Vec` で保持するか、空スライスを返して別の query API を提供する方法があります。後者では、呼び出し側がその制約を理解している必要があります。

#### 楽観ロックの version 更新

楽観ロックは、読み込んだ時点の version と DB の version が一致する場合だけ更新する方法です。
DB の更新に成功した後、キャッシュ内の `FlowInstance` も同じ version に進めます。
`set_version()` は version だけを変更し、現在の state、context、sub-flow の状態を保持します。

```rust
let next_version = flow.version() + 1;
// UPDATE flows SET version = next_version WHERE id = flow.id AND version = flow.version()
flow.set_version(next_version);
```

旧名の `set_version_public()` は互換性のため残っています。新規コードでは `set_version()` を使用してください。

### Async Store について

Rust の `FlowEngine` と `FlowStore` は同期 API です。async DB クライアント（sqlx など）を接続する方法の一つが、同期側から完了を待つ `block_on` です。
次の抜粋はその接続部分を示しています。`runtime`、`pool`、`cache` は store 側のフィールドで、SQL とエラー処理は省略しています。

```rust
fn create(&mut self, flow: FlowInstance<S>) {
    self.runtime.block_on(async {
        sqlx::query("INSERT INTO flows ...")
            .execute(&self.pool).await.unwrap();
    });
    self.cache.insert(flow.id.clone(), flow);
}
```

この方法では DB の応答を待つ間、呼び出したスレッドも待ちます。実行する runtime の制約を確認し、非同期タスク内からそのまま使えるとは考えないでください。
Processor の I/O をどこで行うかは、[I/O Separation Patterns](io-separation.md) を参照してください。

## 使わない方がよい場合

テストや、プロセス内だけで完結するフローであれば、`InMemoryFlowStore` をそのまま使う方が簡単です。
監査記録の追加だけが目的なら、既存の `AuditingStore` で足りるかを先に確認してください。
DB 待ちでスレッドを占有できない処理には、上の `block_on` 例をそのまま使わず、I/O の実行場所を分ける設計が必要です。
