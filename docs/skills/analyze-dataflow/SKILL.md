---
name: analyze-dataflow
description: tramli の DataFlowGraph API でデータ依存を分析する手順。availableAt/producersOf/consumersOf/deadData/lifetime/pruningHints/impactOf の使い方
volta:
  version: 1
  namespace: tramli
  locality: repo
  tags: [tramli, dataflow, analysis, data-flow-graph]
  applies_when:
    - repo.has_file: lang/
  requires:
    tools: []
    resources: []
  min_role: viewer
  export: allowed
---
# tramli DataFlowGraph でデータ依存分析

`build()` が成功すると `definition.dataFlowGraph()` で DataFlowGraph インスタンスが取得できる。これはフロー内のデータ依存関係を分析する豊富な API を持つ。

## 1. availableAt(state) — ある状態で利用可能なデータ

いつ使う: 「状態 X に到達したとき、どのデータ型が使えるか？」を確認するとき。

```java
Set<Class<?>> available = graph.availableAt(PAYMENT_CONFIRMED);
// {OrderRequest, PaymentIntent, PaymentResult}
```

```typescript
const available: Set<string> = graph.availableAt('PAYMENT_CONFIRMED');
```

```rust
let available: HashSet<TypeId> = graph.available_at(PaymentConfirmed);
// Rust は explain() で詳細な診断も取得可能
let info = graph.explain(PaymentConfirmed);
// ExplainResult { state, available, missing: [...] }
```

## 2. producersOf(type) / consumersOf(type) — 誰が作り誰が使うか

いつ使う: あるデータ型の生産者と消費者を特定するとき。

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
let consumers = graph.consumers_of(&TypeId::of::<PaymentIntent>());
```

## 3. deadData() — 使われないデータ型

いつ使う: produce されたが下流で一度も consume されない型を見つけるとき。デッドコード検出に相当。

```java
Set<Class<?>> dead = graph.deadData();
// {ShipmentInfo} — SHIPPED で生産されたが下流の processor がいない
```

```typescript
const dead: Set<string> = graph.deadData();
```

```rust
let dead: HashSet<TypeId> = graph.dead_data();
```

## 4. lifetime(type) — データ型のライフサイクル

いつ使う: あるデータ型が最初に生産されてから最後に消費されるまでの範囲を確認するとき。

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
// Some((PaymentPending, Confirmed))
```

## 5. pruningHints() — メモリ最適化の手がかり

いつ使う: 各状態で不要になった型を見つけて、FlowContext から削除可能か判断するとき。

```java
Map<S, Set<Class<?>>> hints = graph.pruningHints();
// {SHIPPED: [OrderRequest, PaymentIntent]} — SHIPPED 以降では削除可能
```

```typescript
const hints: Map<string, Set<string>> = graph.pruningHints();
```

```rust
let hints: HashMap<OrderState, HashSet<TypeId>> = graph.pruning_hints();
```

## 6. impactOf(type) — 変更影響範囲

いつ使う: 「このデータ型を変更したら、どの processor に影響するか？」を確認するとき。

```java
var impact = graph.impactOf(PaymentIntent.class);
// producers: [OrderInit], consumers: [PaymentGuard]
```

```typescript
const impact = graph.impactOf(PaymentIntent);
```

```rust
let (producers, consumers) = graph.impact_of(&TypeId::of::<PaymentIntent>());
```

## 7. parallelismHints() — 並列化の可能性

いつ使う: データ依存のない processor ペアを見つけて並列実行を検討するとき。

```java
List<String[]> hints = graph.parallelismHints();
// [["RiskCheck", "AddressValidation"]] — データ依存がない
```

```typescript
const hints: [string, string][] = graph.parallelismHints();
```

```rust
let hints: Vec<(String, String)> = graph.parallelism_hints();
```

## 判断基準

- デッドデータ（`deadData()`）が見つかったら、不要な produces を削除するか、下流で消費する processor を追加する
- `pruningHints()` は長時間実行フローでメモリ圧縮の指針になる
- `impactOf()` はリファクタリング前の影響分析に使う
- Rust の `explain()` は `availableAt` より詳細で、missing 型とその理由も分かる
