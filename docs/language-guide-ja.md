[English version](language-guide.md)

# 言語ガイド — Java / TypeScript / Rust

tramli は3つの実装を持つ。**設計は同一**。**async 戦略が言語ごとに異なる**。

## 核心原則

> **SM エンジンは判断マシンであり、I/O マシンではない。**
> 「次にどの state に行くか」をマイクロ秒で決定する。
> I/O（HTTP 呼出、DB クエリ）はエンジンの外で行う。

この原則は3言語すべてで共通。違いは **async I/O を境界でどう扱うか**。

---

## 言語別 Async 戦略

### Java: Sync のみ

```java
engine.startFlow(definition, null, initialData);      // sync, ~1μs
engine.resumeAndExecute(flowId, definition, data);    // sync, ~300ns

// resume 間の async I/O が必要なら:
var result = CompletableFuture.supplyAsync(() -> httpClient.send(req));
```

**なぜ sync か？** Java 21 に virtual threads がある。`Thread.startVirtualThread(() -> blockingIO())` は async/await よりシンプルでデバッグしやすい。Future state machine のオーバーヘッドもない。

### TypeScript: Sync + optional async

```typescript
// Sync processor（デフォルト — Auto 遷移用）
const orderInit: StateProcessor<OrderState> = {
  process: (ctx) => {  // sync
    const req = ctx.get(OrderRequest);
    ctx.put(PaymentIntent, { txnId: `txn-${req.itemId}` });
  },
};

// Async processor（オプション — External 遷移のみ）
const paymentVerify: AsyncStateProcessor<OrderState> = {
  process: async (ctx) => {  // async
    const callback = ctx.get(PaymentCallback);
    const result = await stripe.verify(callback.sessionId);
    ctx.put(PaymentResult, result);
  },
};
```

**ルール: Auto 遷移は必ず sync processor。External 遷移のみ async 可。**

理由: Auto-chain は連鎖実行する。全部 async にすると `await` のチェーンが無駄に深くなる。Auto はマイクロ秒の判断だから sync で十分。

**なぜ TS では async OK か？** TypeScript の `Promise` は heap 配置。スタックサイズ問題なし。コストは microtask queue エントリ (~1μs) で無視できる。

### Rust: Sync のみ

```rust
let flow_id = engine.start_flow(&def, None, initial_data)?;    // sync, ~1μs
engine.resume_and_execute(&flow_id, &def, external_data)?;     // sync, ~300ns

// resume 間の async I/O（tower::Service や tokio task で）:
let auth_result = volta_client.check_auth(&req).await;
```

**なぜ sync か？** Rust の async はコンパイル時に `Future` state machine を生成する。SM エンジンが async だと、`Future` に `&mut FlowEngine` + `FlowContext` + 全 processor の状態が `.await` ポイントを超えて含まれる。3+ states で**スタックオーバーフロー**（`rust/ASYNC_STACK_ISSUE.md` 参照）。

解決策: SM は sync のまま。async I/O は呼び出し側（tower::Service, tokio task 等）で。[`async-integration.md`](async-integration.md) にパターンを記載。

---

## API 比較

| 概念 | Java | TypeScript | Rust |
|------|------|------------|------|
| 状態 enum | `enum S implements FlowState` | `const enum` + `FlowState` type | `enum S` + `FlowState` trait |
| Processor | `interface StateProcessor` | `StateProcessor<S>` object | `trait StateProcessor<S>` |
| Guard 出力 | `sealed interface GuardOutput` | discriminated union | `enum GuardOutput` |
| Flow context | `Class<T>` keyed `HashMap` | string/symbol keyed `Map` | `TypeId` keyed `HashMap` |
| 定義 | `Tramli.define("name", S.class)` | `tramli("name", S)` | `FlowDefinition::builder("name")` |
| Build 検証 | `build()` が例外 | `build()` が例外 | `build()` が `Result` |
| Mermaid | `MermaidGenerator.generate(def)` | `generateMermaid(def)` | `MermaidGenerator::generate(&def)` |

## どの言語を使うべきか

| スタック | 推奨 |
|---------|------|
| Java / Kotlin / Spring | `java/` — native enum + sealed, virtual threads |
| Node.js / Deno / Bun | `ts/` — External 遷移に optional async |
| Rust / システムプログラミング | `rust/` — ゼロコスト sync, async は外側 |
| マルチ言語 | 3つとも同じ設計。サービスごとに選択 |
