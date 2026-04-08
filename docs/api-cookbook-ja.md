# tramli API クックブック

全 tramli API の実践的な使用例。各レシピは**いつ使うか**と**どう使うか**を示す。

---

## FlowDefinition Builder

### `from(state).auto(to, processor)`

いつ: 前のステップの直後に自動実行する内部処理。

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit 実行 → PAYMENT_PENDING
```

### `from(state).external(to, guard)`

いつ: 外部イベント（HTTP コールバック、webhook、ユーザーアクション）を待つ。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// PAYMENT_PENDING で停止、resumeAndExecute() が呼ばれるまで待機
```

### `from(state).external(to, guard, timeout)`

いつ: 期限付きの外部イベント待ち。時間内にイベントが来なければ expire。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
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

### `from(state).subFlow(def).onExit("X", s).endSubFlow()`

いつ: 親フロー内に子フローを埋め込む。

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
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

### `.initiallyAvailable(types...)` / `.ttl(duration)` / `.maxGuardRetries(n)` / `.build()`

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

### `lastError()` / `activeSubFlow()` / `statePath()` / `statePathString()`

いつ: デバッグとログ。

```java
log.error("エラー: {}", flow.lastError());              // "HttpTimeoutException: Connection timed out"
log.info("状態パス: {}", flow.statePathString());        // "PAYMENT/CONFIRM"
```

### `waitingFor()` / `availableData()` / `missingFor()`

いつ: クライアントに何を送るべきか伝える / デバッグ。

```java
flow.waitingFor();     // {OidcCallback.class} — クライアントが送るべきデータ
flow.availableData();  // {OidcRequest, OidcRedirect} — 現在利用可能
flow.missingFor();     // {PaymentResult} — 次の遷移に不足
```

### `withVersion(n)` / `stateEnteredAt()`

いつ: FlowStore の楽観ロック / per-state タイムアウト。

```java
flow = flow.withVersion(flow.version() + 1);  // DB save 後
Duration elapsed = Duration.between(flow.stateEnteredAt(), Instant.now());
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

### `registerAlias` / `toAliasMap` / `fromAliasMap`

いつ: FlowContext を JSON に永続化。

```java
ctx.registerAlias(OrderRequest.class, "OrderRequest");
String json = objectMapper.writeValueAsString(ctx.toAliasMap());
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

### 検証系

```java
graph.assertDataFlow(flow.context(), flow.currentState());  // 不変条件チェック
DataFlowGraph.verifyProcessor(orderInit, ctx);              // requires/produces 突き合わせ
DataFlowGraph.isCompatible(procV1, procV2);                 // 交換可能性チェック
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

### 出力系

```java
graph.toMermaid();                                // Mermaid 図
graph.toJson();                                   // 構造化 JSON
graph.toMarkdown();                               // 移植チェックリスト
graph.renderDataFlow(myDotRenderer);              // カスタムレンダリング
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

---

## コード生成

```java
MermaidGenerator.generate(def);                  // 状態遷移図
MermaidGenerator.generateDataFlow(def);          // データフロー図
MermaidGenerator.generateExternalContract(def);  // External データ契約図
SkeletonGenerator.generate(def, Language.RUST);  // Processor スケルトン
def.renderStateDiagram(myDotRenderer);           // カスタム状態図
```

---

## FlowErrorType

```java
throw new FlowException("TIMEOUT", "timed out", e)
    .withErrorType(FlowErrorType.RETRYABLE);   // リトライ可能
throw new FlowException("AUTH", "bad creds", e)
    .withErrorType(FlowErrorType.FATAL);        // 致命的
```
