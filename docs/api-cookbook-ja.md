# tramli API クックブック

全 tramli API の実践的な使用例。各レシピは**いつ使うか**と**どう使うか**を示す。

> **Java**、**TypeScript**、**Rust** の例を併記。
> TS の主な違い: `Class<?>` の代わりに文字列ベースの `flowKey<T>()`、エンジンメソッドに `async/await`、`Duration` の代わりにミリ秒。
> Rust の主な違い: `TypeId` ベースのコンテキスト (`ctx.get::<T>()`), `requires![]` マクロ、trait 実装、`Arc<FlowDefinition<S>>` でスレッド安全な共有。

---

## Rust: Processor・Guard・Branch の実装パターン

Rust では、processor・guard・branch は **trait** をクラス（struct）に実装する形をとる。

```rust
// StateProcessor — Auto 遷移に使用
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

// TransitionGuard — External 遷移に使用
struct PaymentGuard;
impl TransitionGuard<OrderState> for PaymentGuard {
    fn name(&self) -> &str { "PaymentGuard" }
    fn requires(&self) -> Vec<TypeId> { requires![PaymentCallback] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentResult] }
    fn validate(&self, ctx: &FlowContext) -> GuardOutput {
        match ctx.find::<PaymentCallback>() {
            Some(cb) if cb.status == "ok" =>
                GuardOutput::accept_with(PaymentResult { success: true }),
            Some(cb) => GuardOutput::rejected(format!("Declined: {}", cb.status)),
            None => GuardOutput::rejected("Missing callback"),
        }
    }
}

// BranchProcessor — Branch 遷移に使用
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

// SubFlowRunner — v1.8.0 で create_instance() に変更
// 通常は SubFlowAdapter::new(Arc::new(def)) で自動実装される（下記 subFlow() 参照）
```

---

## FlowDefinition Builder

### `from(state).auto(to, processor)`

いつ: 前のステップの直後に自動実行する内部処理。

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit 実行 → PAYMENT_PENDING
```

```typescript
.from('CREATED').auto('PAYMENT_PENDING', orderInit)
// CREATED → OrderInit 実行 → PAYMENT_PENDING
```

### `from(state).external(to, guard)`

いつ: 外部イベント（HTTP コールバック、webhook、ユーザーアクション）を待つ。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// PAYMENT_PENDING で停止、resumeAndExecute() が呼ばれるまで待機
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard)
// PAYMENT_PENDING で停止、resumeAndExecute() が呼ばれるまで待機
```

### `from(state).external(to, guard, timeout)`

いつ: 期限付きの外部イベント待ち。時間内にイベントが来なければ expire。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
// 5分以内に決済完了しなければ EXPIRED
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard, { timeout: 5 * 60_000 })
// 5分以内に決済完了しなければ EXPIRED
```

### `from(state).branch(branch).to(s, label).endBranch()`

いつ: コンテキストデータに基づく条件分岐。

```java
.from(RISK_CHECKED).branch(riskBranch)
    .to(COMPLETE, "low_risk", sessionIssue)
    .to(MFA_REQUIRED, "high_risk", mfaInit)
    .to(BLOCKED, "blocked")
    .endBranch()
// RiskBranch.decide() が "low_risk", "high_risk", "blocked" を返す
```

```typescript
.from('RISK_CHECKED').branch(riskBranch)
    .to('COMPLETE', 'low_risk', sessionIssue)
    .to('MFA_REQUIRED', 'high_risk', mfaInit)
    .to('BLOCKED', 'blocked')
    .endBranch()
// riskBranch.decide() が 'low_risk', 'high_risk', 'blocked' を返す
```

### `from(state).subFlow(def).onExit("X", s).endSubFlow()`

いつ: 親フロー内に子フローを埋め込む。

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
    .endSubFlow()
// paymentDetailFlow が PAYMENT 内で実行され、terminal → 親の状態にマッピング
```

```typescript
.from('PAYMENT').subFlow(paymentDetailFlow)
    .onExit('DONE', 'PAYMENT_COMPLETE')
    .onExit('FAILED', 'PAYMENT_FAILED')
    .endSubFlow()
// paymentDetailFlow が PAYMENT 内で実行され、terminal → 親の状態にマッピング
```

### `.onError(from, to)` / `.onStepError(from, ExceptionClass, to)` / `.onAnyError(state)`

いつ: エラー遷移の定義。例外型で分岐も可能。

```java
.onStepError(TOKEN_EXCHANGE, HttpTimeoutException.class, RETRIABLE_ERROR)  // タイムアウト → リトライ
.onStepError(TOKEN_EXCHANGE, InvalidTokenException.class, TERMINAL_ERROR)  // 不正トークン → 致命的
.onAnyError(CANCELLED)  // フォールバック
```

```typescript
.onStepError('TOKEN_EXCHANGE', HttpTimeoutError, 'RETRIABLE_ERROR')  // タイムアウト → リトライ
.onStepError('TOKEN_EXCHANGE', InvalidTokenError, 'TERMINAL_ERROR')  // 不正トークン → 致命的
.onAnyError('CANCELLED')  // フォールバック
```

### `.initiallyAvailable(types...)` / `.setTtl(ms)` / `.setMaxGuardRetries(n)` / `.build()`

いつ: フロー定義の設定と構築。

```java
var def = Tramli.define("order", OrderState.class)
    .ttl(Duration.ofHours(24))
    .maxGuardRetries(3)
    .initiallyAvailable(OrderRequest.class)
    // ... transitions ...
    .build();  // ← 8項目検証 + データフロー検証
for (String w : def.warnings()) log.warn(w);  // liveness 警告等
```

```typescript
const def = Tramli.define<OrderState>('order', stateConfig)
    .setTtl(24 * 60 * 60_000)
    .setMaxGuardRetries(3)
    .initiallyAvailable(OrderRequest)
    // ... transitions ...
    .build();  // ← 8項目検証 + データフロー検証
for (const w of def.warnings) console.warn(w);  // liveness 警告等
```

---

## FlowEngine

### `startFlow` / `resumeAndExecute`

いつ: フロー開始と外部イベントでの再開。

```java
var flow = engine.startFlow(oidcFlow, "session-123",
    Map.of(OidcRequest.class, new OidcRequest("GOOGLE", "/")));
// Auto-chain: INIT → REDIRECTED（External で停止）

flow = engine.resumeAndExecute(flow.id(), oidcFlow,
    Map.of(OidcCallback.class, new OidcCallback("auth-code", "state")));
// Guard 検証 → auto-chain → COMPLETE
```

```typescript
const flow = await engine.startFlow(oidcFlow, 'session-123',
    Tramli.data([OidcRequest, { provider: 'GOOGLE', redirectUri: '/' }]));
// Auto-chain: INIT → REDIRECTED（External で停止）

const resumed = await engine.resumeAndExecute(flow.id, oidcFlow,
    Tramli.data([OidcCallback, { code: 'auth-code', state: 'state' }]));
// Guard 検証 → auto-chain → COMPLETE
```

---

## FlowInstance

### `currentState()` / `isCompleted()` / `exitState()`

いつ: フローの現在位置と完了状態の確認。

```java
if (flow.isCompleted()) {
    switch (flow.exitState()) {
        case "COMPLETE" -> sendWelcomeEmail(flow);
        case "EXPIRED" -> log.warn("フロータイムアウト");
    }
}
```

```typescript
if (flow.isCompleted) {
    switch (flow.exitState) {
        case 'COMPLETE': sendWelcomeEmail(flow); break;
        case 'EXPIRED': console.warn('フロータイムアウト'); break;
    }
}
```

### `lastError()` / `activeSubFlow()` / `statePath()` / `statePathString()`

いつ: デバッグとログ。

```java
log.error("エラー: {}", flow.lastError());              // "HttpTimeoutException: Connection timed out"
log.info("状態パス: {}", flow.statePathString());        // "PAYMENT/CONFIRM"
```

```typescript
console.error(`エラー: ${flow.lastError}`);              // "Error: Connection timed out"
console.log(`状態パス: ${flow.statePathString()}`);      // "PAYMENT/CONFIRM"
```

### `waitingFor()` / `availableData()` / `missingFor()`

いつ: クライアントに何を送るべきか伝える / デバッグ。

```java
flow.waitingFor();     // {OidcCallback.class} — クライアントが送るべきデータ
flow.availableData();  // {OidcRequest, OidcRedirect} — 現在利用可能
flow.missingFor();     // {PaymentResult} — 次の遷移に不足
```

```typescript
flow.waitingFor();     // ['OidcCallback'] — クライアントが送るべきデータ
flow.availableData();  // Set {'OidcRequest', 'OidcRedirect'} — 現在利用可能
flow.missingFor();     // ['PaymentResult'] — 次の遷移に不足
```

### `withVersion(n)` / `stateEnteredAt()`

いつ: FlowStore の楽観ロック / per-state タイムアウト。

```java
flow = flow.withVersion(flow.version() + 1);  // DB save 後
Duration elapsed = Duration.between(flow.stateEnteredAt(), Instant.now());
```

```typescript
const updated = flow.withVersion(flow.version + 1);  // DB save 後
const elapsedMs = Date.now() - flow.stateEnteredAt.getTime();
```

---

## FlowContext

### `get` / `find` / `put` / `has`

いつ: Processor 内でのデータ読み書き。

```java
OrderRequest req = ctx.get(OrderRequest.class);          // なければ例外
Optional<Coupon> coupon = ctx.find(Coupon.class);         // Optional
ctx.put(PaymentIntent.class, new PaymentIntent("txn-1")); // 書き込み
if (ctx.has(FraudScore.class)) { ... }                    // 存在確認
```

```typescript
const req = ctx.get(OrderRequest);                           // なければ例外
const coupon = ctx.find(Coupon);                             // T | undefined
ctx.put(PaymentIntent, { transactionId: 'txn-1' });         // 書き込み
if (ctx.has(FraudScore)) { /* ... */ }                       // 存在確認
```

### `registerAlias` / `toAliasMap` / `fromAliasMap`

いつ: FlowContext を JSON に永続化。

```java
ctx.registerAlias(OrderRequest.class, "OrderRequest");
String json = objectMapper.writeValueAsString(ctx.toAliasMap());
// {"OrderRequest": {...}}
```

```typescript
ctx.registerAlias(OrderRequest, 'OrderRequest');
const json = JSON.stringify(Object.fromEntries(ctx.toAliasMap()));
// {"OrderRequest": {...}}
```

---

## DataFlowGraph

### クエリ系

```java
graph.availableAt(CONFIRMED);                    // 状態 X で利用可能な型
graph.producersOf(PaymentIntent.class);           // 誰が produces する
graph.consumersOf(PaymentIntent.class);           // 誰が requires する
graph.deadData();                                 // produces されたが requires されない型
graph.lifetime(PaymentIntent.class);              // データのライフサイクル
graph.pruningHints();                             // 各状態で不要になった型
graph.impactOf(PaymentIntent.class);              // 型変更の影響範囲
graph.parallelismHints();                         // 独立実行可能な processor ペア
```

```typescript
graph.availableAt('CONFIRMED');                  // 状態 X で利用可能な型
graph.producersOf(PaymentIntent);                // 誰が produces する
graph.consumersOf(PaymentIntent);                // 誰が requires する
graph.deadData();                                // produces されたが requires されない型
graph.lifetime(PaymentIntent);                   // データのライフサイクル
graph.pruningHints();                            // 各状態で不要になった型
graph.impactOf(PaymentIntent);                   // 型変更の影響範囲
graph.parallelismHints();                        // 独立実行可能な processor ペア
```

### 検証系

```java
graph.assertDataFlow(flow.context(), flow.currentState());  // 不変条件チェック
DataFlowGraph.verifyProcessor(orderInit, ctx);              // requires/produces 突き合わせ
DataFlowGraph.isCompatible(procV1, procV2);                 // 交換可能性チェック
```

```typescript
graph.assertDataFlow(flow.context, flow.currentState);       // 不変条件チェック
await DataFlowGraph.verifyProcessor(orderInit, ctx);         // requires/produces 突き合わせ
DataFlowGraph.isCompatible(procV1, procV2);                  // 交換可能性チェック
```

### 移植支援系

```java
graph.migrationOrder();                           // 依存順の移植推奨順序
graph.testScaffold();                             // テスト用最小データセット
graph.generateInvariantAssertions();              // 各状態の不変条件文字列
DataFlowGraph.crossFlowMap(graph1, graph2);       // フロー間データ依存
DataFlowGraph.diff(v1Graph, v2Graph);             // グラフ差分
DataFlowGraph.versionCompatibility(v1, v2);       // バージョン互換性
```

```typescript
graph.migrationOrder();                          // 依存順の移植推奨順序
graph.testScaffold();                            // テスト用最小データセット
graph.generateInvariantAssertions();             // 各状態の不変条件文字列
DataFlowGraph.crossFlowMap(graph1, graph2);      // フロー間データ依存
DataFlowGraph.diff(v1Graph, v2Graph);            // グラフ差分
DataFlowGraph.versionCompatibility(v1, v2);      // バージョン互換性
```

### 出力系

```java
graph.toMermaid();                                // Mermaid 図
graph.toJson();                                   // 構造化 JSON
graph.toMarkdown();                               // 移植チェックリスト
graph.renderDataFlow(myDotRenderer);              // カスタムレンダリング
```

```typescript
graph.toMermaid();                               // Mermaid 図
graph.toJson();                                  // 構造化 JSON
graph.toMarkdown();                              // 移植チェックリスト
// renderDataFlow は Java のみ。TS は toJson() + 独自レンダラー
```

---

## ロギング

```java
engine.setTransitionLogger(e -> log.info("{} → {}", e.flowName(), e.from(), e.to()));
engine.setGuardLogger(e -> log.info("guard {}: {}", e.guardName(), e.result()));
engine.setStateLogger(e -> log.debug("put {}", e.typeName()));
engine.setErrorLogger(e -> alertService.send(e.trigger() + " at " + e.from()));
engine.removeAllLoggers();
```

```typescript
engine.setTransitionLogger(e => console.log(`${e.flowName} ${e.from} → ${e.to}`));
engine.setGuardLogger(e => console.log(`guard ${e.guardName}: ${e.result}`));
engine.setStateLogger(e => console.debug(`put ${e.key}`));
engine.setErrorLogger(e => alertService.send(`${e.trigger} at ${e.from}`));
engine.removeAllLoggers();
```

---

## Pipeline

```java
// 定義 + 実行
var pipeline = Tramli.pipeline("csv-import")
    .initiallyAvailable(RawInput.class)
    .step(parse).step(validate).step(save)
    .build();
FlowContext result = pipeline.execute(Map.of(RawInput.class, rawData));

// エラーハンドリング
try { pipeline.execute(data); }
catch (PipelineException e) {
    e.failedStep();       // "validate"
    e.completedSteps();   // ["parse"]
    e.context();          // parse の結果が入った FlowContext
}

// 分析
pipeline.dataFlow().deadData();
pipeline.dataFlow().toMermaid();

// ネスト
var main = Tramli.pipeline("main").step(otherPipeline.asStep()).build();

// strictMode
pipeline.setStrictMode(true);
```

```typescript
// 定義 + 実行
const pipeline = Tramli.pipeline('csv-import')
    .initiallyAvailable(RawInput)
    .step(parse).step(validate).step(save)
    .build();
const result = await pipeline.execute(Tramli.data([RawInput, rawData]));

// エラーハンドリング
try { await pipeline.execute(data); }
catch (e) {
    if (e instanceof PipelineException) {
        e.failedStep;        // 'validate'
        e.completedSteps;    // ['parse']
        e.context;           // parse の結果が入った FlowContext
    }
}

// 分析
pipeline.dataFlow().deadData();
pipeline.dataFlow().toMermaid();

// ネスト
const main = Tramli.pipeline('main').step(otherPipeline.asStep()).build();

// strictMode
pipeline.setStrictMode(true);
```

```rust
// 定義 + 実行
let pipeline = PipelineBuilder::new("csv-import")
    .initially_available(requires![RawInput])
    .step(Box::new(parse)).step(Box::new(validate)).step(Box::new(save))
    .build()?;
let result = pipeline.execute(vec![
    (TypeId::of::<RawInput>(), Box::new(raw_data) as Box<dyn CloneAny>),
])?;

// エラーハンドリング
match pipeline.execute(data) {
    Err(e) => {
        eprintln!("Step '{}' failed, completed: {:?}", e.failed_step, e.completed_steps);
        // e.cause: FlowError
    }
    Ok(ctx) => { /* ctx を使用 */ }
}

// 分析
let dead: HashSet<TypeId> = pipeline.data_flow().dead_data();

// ネスト: asStep() は Java/TS のみ。Rust は PipelineStep trait を struct に実装して合成する

// strictMode
pipeline.set_strict_mode(true);
pipeline.execute(data)?;  // declares 違反時は PipelineError を返す
```

---

## コード生成

```java
MermaidGenerator.generate(def);                  // 状態遷移図
MermaidGenerator.generateDataFlow(def);          // データフロー図
MermaidGenerator.generateExternalContract(def);  // External データ契約図
SkeletonGenerator.generate(def, Language.RUST);  // Processor スケルトン
def.renderStateDiagram(myDotRenderer);           // カスタム状態図
```

```typescript
MermaidGenerator.generate(def);                  // 状態遷移図
MermaidGenerator.generateDataFlow(def);          // データフロー図
MermaidGenerator.generateExternalContract(def);  // External データ契約図
SkeletonGenerator.generate(def, 'rust');         // Processor スケルトン
// renderStateDiagram は Java のみ。TS は definition.transitions を直接イテレート
```

```rust
MermaidGenerator::generate(&def);               // 状態遷移図 (stateDiagram-v2)
MermaidGenerator::generate_data_flow(&def);     // データフロー図 (flowchart LR)

// v1.8.0+: MermaidView で明示的に指定
MermaidGenerator::generate_with_view(&def, MermaidView::State);
MermaidGenerator::generate_with_view(&def, MermaidView::DataFlow);

// generateExternalContract / SkeletonGenerator は Java/TS のみ
// renderStateDiagram は Java のみ。Rust は graph.to_mermaid() / graph.to_json() を使用
```

---

## FlowErrorType

```java
throw new FlowException("TIMEOUT", "timed out", e)
    .withErrorType(FlowErrorType.RETRYABLE);   // リトライ可能
throw new FlowException("AUTH", "bad creds", e)
    .withErrorType(FlowErrorType.FATAL);        // 致命的
```

```typescript
throw new FlowError('TIMEOUT', 'timed out')
    .withErrorType('RETRYABLE');               // リトライ可能
throw new FlowError('AUTH', 'bad creds')
    .withErrorType('FATAL');                   // 致命的
```

```rust
// Rust に FlowErrorType enum はない。code 文字列で代替する。
// Processor 内:
return Err(FlowError::with_source("TIMEOUT", "Service timed out", io_err));
return Err(FlowError::new("AUTH_FAILED", "Bad credentials"));

// FlowDefinition でコード文字列によるルーティング:
.on_step_error(TokenExchange, |e| e.code == "TIMEOUT", "Timeout", RetriableError)
.on_step_error(TokenExchange, |e| e.code == "AUTH_FAILED", "AuthFailed", TerminalError)
// マッチしないエラーは on_error / on_any_error にフォールスルー
```
