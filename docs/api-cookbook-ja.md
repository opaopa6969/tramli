# tramli API クックブック

tramli を初めて使う方や、フローを実装・調査しているエンジニア向けの使用例集です。
やりたいことから API を探し、使う場面と Java・TypeScript・Rust での呼び出し方を確認できます。

[英語版](api-cookbook.md)と同じ内容・見出し構成・コード例を収録しています。

## この文書の使い方・読む順番

必要なレシピは、下の対応表から探せます。各レシピは使う場面の説明から始まり、言語別のコード例が続きます。例中の `OrderRequest` や `orderInit` など、アプリ固有の型や処理は定義済みとして読んでください。

初めて読む場合は、次の順番を勧めます。

1. [README のクイックスタート](../README-ja.md#クイックスタート)でフロー全体を動かし、[FlowDefinition Builder](#flowdefinition-builder) と [FlowContext](#flowcontext) で遷移とデータの定義を確認します。
2. [FlowEngine](#flowengine) と [FlowInstance](#flowinstance) で、開始・外部イベントによる再開・進捗の確認を読みます。
3. 依存関係の確認や不具合の調査が必要になったら、[DataFlowGraph](#dataflowgraph) と[ロギング](#ロギング)を読みます。外部入力を待たない直列処理なら、[Pipeline](#pipeline) から始められます。

Rust を使う場合は、Builder に処理を登録する前に[trait の実装例](#rust-processorguardbranch-の実装パターン)を確認してください。

## やりたいことから探す

| やりたいこと | 該当セクション |
|--------------------|------|
| Rust で Processor・イベントの検証・条件分岐を実装する | [Rust の実装例](#rust-processorguardbranch-の実装パターン) |
| 自動で処理を進める・イベントを待つ・進路を選ぶ | [FlowDefinition Builder](#flowdefinition-builder) |
| 大きな処理の中で子フローを再利用する | [SubFlow](#fromstatesubflowdefonexitx-sendsubflow) |
| エラー時の遷移先を決める | [状態ごとのエラー遷移](#onerrorfrom-to)、[エラー分類](#flowerrortype) |
| 初期データ・有効期限を決め、定義を検証する | [初期データと Builder の設定](#initiallyavailabletypes) |
| フローを開始し、外部からの応答を渡す | [FlowEngine](#flowengine) |
| 進捗・エラー・不足する入力を調べる | [FlowInstance](#flowinstance) |
| 型付きデータを処理間で渡す・保存用に変換する | [FlowContext](#flowcontext) |
| データの作成元・使用先・不要な出力・変更の影響を調べる | [DataFlowGraph](#dataflowgraph) |
| 別言語への移植を計画する・フローのバージョンを比較する | [移植支援](#migrationorder)、[バージョン互換性](#versioncompatibilityv1-v2) |
| 独自の状態遷移図を作る・プラグインフローを挿入する | [FlowDefinition](#flowdefinition) |
| 遷移・イベントの拒否・データの書き込み・エラーを記録する | [ロギング](#ロギング) |
| 直列処理を実行し、依存関係を検証する | [Pipeline](#pipeline) |
| 図や Processor の実装ひな形を生成する | [コード生成](#コード生成) |

## 例を読むための用語

- **状態（state）**は `PAYMENT_PENDING` のような処理の段階です。**遷移（transition）**は状態から状態へ進むことで、**終端状態（terminal state）**に入るとフローが終了します。
- **Processor** は遷移時の処理、**Guard** は外部イベントを受け入れるかどうかの検証、**Branch** はデータに応じた進路の選択を担当します。外部イベントには、決済サービスからの HTTP 通知（webhook）などがあります。
- **FlowContext（コンテキスト）**は処理間で共有するデータの入れ物です。**requires / produces** は各処理が必要とするデータと、処理後に用意するデータの宣言で、`build()` が実行前に依存関係を検査するために使います。
- **FlowDefinition** は処理全体の定義、**FlowInstance** は注文1件など、その定義に沿った1回の実行です。**FlowStore** は実行状態の保存・読み込みを担当します。
- **auto-chain（自動連鎖）**は、外部入力の待機や終了まで自動遷移が続くことです。**SubFlow（子フロー）**は別のフローを組み合わせ、終了結果を親フローの状態に対応付ける仕組みです。個々のフローの状態はフラットなままです。
- ログインの例にある **OIDC（OpenID Connect）**は OAuth 2.0 を基にしたログイン用のプロトコルです。コールバックは認証サービスからの応答、**MFA（多要素認証）**は本人確認を追加する仕組みを指します。

## 言語ごとの読み方

- **Java:** `OrderRequest.class` のようにクラスでデータを識別し、時間の長さは `Duration` で指定します。
- **TypeScript（TS）:** `flowKey<T>()` でデータ型に対応する文字列ベースのキーを作ります。エンジンのメソッドには `async/await` を使い、時間の長さはミリ秒で指定します。
- **Rust:** 型を識別する `TypeId` を使い、データは `ctx.get::<T>()` で読みます。`requires![]` は型のリストを作るマクロ、trait は処理が実装すべき振る舞いの定義、クロージャはコールバックとして渡す関数です。`Arc<FlowDefinition<S>>` は参照カウントによって定義を複数スレッドで安全に共有します。

メソッド名・戻り値・利用できる補助 API は言語ごとに異なります。使用する言語の例と、その前後にある制約の注記を確認してください。

---

## Rust: Processor・Guard・Branch の実装パターン

Rust のフローが呼び出す処理を実装するときの例です。**trait** は実装すべきメソッドの定義で、各処理を担う struct に実装してから Builder に渡します。

### `StateProcessor<S>`（Auto 遷移）

**いつ使うか:** 注文から決済用データを作るなど、入力を読んで結果を書き込む自動処理に使います。`process` に処理を書き、`requires` と `produces` で入力と出力の型を宣言します。

```rust
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
// Use: .from(Created).auto(PaymentPending, Box::new(OrderInit))
```

### `TransitionGuard<S>`（External 遷移）

**いつ使うか:** 決済成功の通知だけを受け入れるなど、フローを進める前に外部からの応答を検証するときに使います。`validate` は受け入れ時の出力データ、または拒否理由を返します。

```rust
struct PaymentGuard;

impl TransitionGuard<OrderState> for PaymentGuard {
    fn name(&self) -> &str { "PaymentGuard" }
    fn requires(&self) -> Vec<TypeId> { requires![PaymentCallback] }
    fn produces(&self) -> Vec<TypeId> { requires![PaymentResult] }
    fn validate(&self, ctx: &FlowContext) -> GuardOutput {
        let cb = match ctx.find::<PaymentCallback>() {
            Some(cb) => cb,
            None => return GuardOutput::rejected("Missing callback"),
        };
        if cb.status == "ok" {
            GuardOutput::accept_with(PaymentResult { success: true })
        } else {
            GuardOutput::rejected(format!("Payment declined: {}", cb.status))
        }
    }
}
// Use: .from(PaymentPending).external(Confirmed, Box::new(PaymentGuard))
```

### `BranchProcessor<S>`（Branch 遷移）

**いつ使うか:** コンテキストにあるデータで進路を選ぶときに使います。`decide` が返すラベルに、Builder 側で遷移先を対応付けます。

```rust
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
// Use: .from(RiskChecked).branch(Box::new(RiskBranch)).to(...)
```

### `SubFlowRunner`（独自の子フロー、v1.8.0 以降）

**いつ使うか:** FlowDefinition を直接渡す代わりに、独自の実行処理で子フローを組み込むときに使います。通常は `SubFlowAdapter` が組み込みを担当します。独自の `SubFlowRunner` は子フローのインスタンスと終端状態の名前を提供します。

```rust
// For most cases, SubFlowAdapter wraps a FlowDefinition automatically:
SubFlowAdapter::new(Arc::new(payment_detail_def))
// See the subFlow() section below.

// Custom implementation (when you need non-FlowDefinition-based sub-flows):
struct MySubFlowRunner { def: Arc<FlowDefinition<SubState>> }

impl SubFlowRunner for MySubFlowRunner {
    fn name(&self) -> &str { "my-sub-flow" }
    fn terminal_names(&self) -> Vec<String> { vec!["Done".into(), "Failed".into()] }
    fn create_instance(&self) -> Box<dyn SubFlowInstance> {
        SubFlowAdapter::new(self.def.clone()).create_instance()
    }
}
// v1.8.0 renamed instantiate() → create_instance() — update any custom runners
```

---

## FlowDefinition Builder

状態遷移・初期データ・エラー時の進路を1か所に宣言します。`build()` を呼ぶと、エンジンが使う前に定義を検証します。

### `from(state).auto(to, processor)`

**いつ使うか:** 決済リクエストの作成など、遷移元の状態に入ったらすぐに実行したい処理に使います。Auto 遷移は外部イベントを待たずに Processor を実行します。

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit runs → PAYMENT_PENDING
```

```typescript
.from('CREATED').auto('PAYMENT_PENDING', orderInit)
// CREATED → OrderInit runs → PAYMENT_PENDING
```

```rust
.from(Created).auto(PaymentPending, order_init)
// Created → order_init runs → PaymentPending
```

### `from(state).external(to, guard)`

**いつ使うか:** 決済通知やユーザー操作が届くまで、次の処理に進めないときに使います。External 遷移は `resumeAndExecute()` を待ち、渡されたデータを Guard が受け入れるか拒否するか検証します。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// Flow stops at PAYMENT_PENDING until resumeAndExecute() is called
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard)
// Flow stops at PAYMENT_PENDING until resumeAndExecute() is called
```

```rust
.from(PaymentPending).external(Confirmed, payment_guard)
// Flow stops at PaymentPending until resume_and_execute() is called
```

### `from(state).external(to, guard, timeout)`

**いつ使うか:** 決済通知など、特定の応答待ちに期限を設けたいときに使います。この External 遷移にタイムアウトを指定し、時間内にイベントが来なければフローを期限切れにします。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
// 5 minutes to complete payment, then EXPIRED
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard, { timeout: 5 * 60_000 })
// 5 minutes to complete payment, then EXPIRED
```

```rust
.from(PaymentPending).external_with_timeout(Confirmed, payment_guard, Duration::from_secs(300))
// 5 minutes to complete payment, then EXPIRED
```

### `from(state).branch(branch).to(s, label).endBranch()`

**いつ使うか:** リスクスコアによって追加認証を求めるなど、データで次の処理を選ぶときに使います。Branch が返すラベルに、定義側で遷移先を対応付けます。

```java
.from(RISK_CHECKED).branch(riskBranch)
    .to(COMPLETE, "low_risk", sessionIssue)
    .to(MFA_REQUIRED, "high_risk", mfaInit)
    .to(BLOCKED, "blocked")
    .endBranch()
// RiskBranch.decide() returns "low_risk", "high_risk", or "blocked"
```

```typescript
.from('RISK_CHECKED').branch(riskBranch)
    .to('COMPLETE', 'low_risk', sessionIssue)
    .to('MFA_REQUIRED', 'high_risk', mfaInit)
    .to('BLOCKED', 'blocked')
    .endBranch()
// riskBranch.decide() returns 'low_risk', 'high_risk', or 'blocked'
```

```rust
.from(RiskChecked).branch(risk_branch)
    .to(Complete, "low_risk")
    .to(MfaRequired, "high_risk")
    .to(Blocked, "blocked")
    .end_branch()
// risk_branch.decide() returns "low_risk", "high_risk", or "blocked"
```

### `from(state).subFlow(def).onExit("X", s).endSubFlow()`

**いつ使うか:** 決済のように独自の手順を持つ処理を、大きなフローの中で再利用するときに使います。SubFlow は子フローを実行し、子が終了した状態（終端状態）を親フローの次の状態に対応付けます。

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
    .endSubFlow()
// paymentDetailFlow runs inside PAYMENT state, then maps terminal → parent state
```

```typescript
.from('PAYMENT').subFlow(paymentDetailFlow)
    .onExit('DONE', 'PAYMENT_COMPLETE')
    .onExit('FAILED', 'PAYMENT_FAILED')
    .endSubFlow()
// paymentDetailFlow runs inside PAYMENT state, then maps terminal → parent state
```

```rust
.from(Payment).sub_flow(Box::new(SubFlowAdapter::new(payment_detail_def)))
    .on_exit("DONE", PaymentComplete)
    .on_exit("FAILED", PaymentFailed)
    .end_sub_flow()
// payment_detail_def runs inside Payment, then maps terminal → parent state
```

<a id="onerrorfrom-to--onsteperrorfrom-exceptionclass-to--onanyerrorstate"></a>

### `.onError(from, to)`

**いつ使うか:** トークン交換の失敗を再試行の経路へ進めるなど、特定の処理だけエラー時の遷移先を変えたいときに使います。`onError` は遷移元の状態ごとにエラーの遷移先を指定します。

```java
.onError(TOKEN_EXCHANGE, RETRIABLE_ERROR)
// If TokenExchange throws → RETRIABLE_ERROR (not the default error state)
```

```typescript
.onError('TOKEN_EXCHANGE', 'RETRIABLE_ERROR')
// If TokenExchange throws → RETRIABLE_ERROR (not the default error state)
```

```rust
.on_error(TokenExchange, RetriableError)
// If processor at TokenExchange fails → RetriableError (not the default error state)
```

### `.onStepError(from, ExceptionClass, to)`

**いつ使うか:** 同じ処理で起きても、タイムアウトと不正なトークンでは対応を分けたいときに使います。Java/TypeScript では例外の型、Rust では述語（エラーを調べる関数）で遷移先を選びます。該当しないエラーは、その状態のエラー遷移に従います。

```java
.onStepError(TOKEN_EXCHANGE, HttpTimeoutException.class, RETRIABLE_ERROR)
.onStepError(TOKEN_EXCHANGE, InvalidTokenException.class, TERMINAL_ERROR)
// Timeout → retry, invalid token → fatal. Unmatched → onError fallback
```

```typescript
.onStepError('TOKEN_EXCHANGE', HttpTimeoutError, 'RETRIABLE_ERROR')
.onStepError('TOKEN_EXCHANGE', InvalidTokenError, 'TERMINAL_ERROR')
// Timeout → retry, invalid token → fatal. Unmatched → onError fallback
```

```rust
.on_step_error(TokenExchange, |e| e.code == "TIMEOUT", "Timeout", RetriableError)
.on_step_error(TokenExchange, |e| e.code == "INVALID_TOKEN", "InvalidToken", TerminalError)
// Timeout → retry, invalid token → fatal. Unmatched → on_error fallback
```

### `.onAnyError(state)`

**いつ使うか:** 個別の設定で扱わないエラーにも、注文のキャンセルなどの遷移先を用意したいときに使います。`onAnyError` は未完了のすべての状態に、この共通の遷移先を設定します。

```java
.onAnyError(CANCELLED)
// Any unhandled error from any state → CANCELLED
```

```typescript
.onAnyError('CANCELLED')
// Any unhandled error from any state → CANCELLED
```

```rust
.on_any_error(Cancelled)
// Any unhandled error from any state → Cancelled
```

<a id="initiallyavailabletypes--setttlms--setmaxguardretriesn--build"></a>

### `.initiallyAvailable(types...)`

**いつ使うか:** 最初の Processor が注文リクエストなど、呼び出し元の入力を必要とするときに使います。型を宣言して `build()` の依存関係チェックに伝え、実際の値は `startFlow()` に渡します。

```java
.initiallyAvailable(OrderRequest.class)
// build() verifies the first processor's requires() is satisfied by this
```

```typescript
.initiallyAvailable(OrderRequest)
// build() verifies the first processor's requires is satisfied by this
```

```rust
.initially_available(requires![OrderRequest])
// build() verifies the first processor's requires() is satisfied by this
```

### `.ttl(duration)` / `.setTtl(ms)`

**いつ使うか:** 現在の状態にかかわらず、処理全体を一定の時間内に終えたいときに使います。TTL（time-to-live）はフロー全体の有効期間で、1つの External 遷移の待機時間とは別に指定します。

```java
.ttl(Duration.ofHours(24))
// Flow expires after 24 hours regardless of state
```

```typescript
.setTtl(24 * 60 * 60_000)
// Flow expires after 24 hours regardless of state
```

```rust
.ttl(Duration::from_secs(86400))
// Flow expires after 24 hours regardless of state
```

### `.maxGuardRetries(n)` / `.setMaxGuardRetries(n)`

**いつ使うか:** 外部入力が繰り返し拒否されたら、エラーの経路へ進めたいときに使います。ここで指定するのは Guard の拒否回数の上限で、リクエストを自動で再送する設定ではありません。

```java
.maxGuardRetries(3)
// After 3 rejections → error transition
```

```typescript
.setMaxGuardRetries(3)
// After 3 rejections → error transition
```

```rust
.max_guard_retries(3)
// After 3 rejections → error transition
```

### `.onStateEnter(state, action)` / `.onStateExit(state, action)`

**いつ使うか:** 状態に入るときや出るときに、監査記録の書き込みなどを行いたい場合に使います。遷移のその時点でエンジンが呼ぶ関数（コールバック）を登録します。

```java
builder
    .onStateEnter(PAYMENT_PENDING, ctx -> auditLog.record("entered payment"))
    .onStateExit(PAYMENT_PENDING, ctx -> auditLog.record("exited payment"))
```

```typescript
builder
    .onStateEnter('PAYMENT_PENDING', ctx => auditLog.record('entered payment'))
    .onStateExit('PAYMENT_PENDING', ctx => auditLog.record('exited payment'))
```

```rust
Builder::new("order")
    .on_state_enter(PaymentPending, |ctx| { ctx.put(EnteredPayment(true)); })
    .on_state_exit(PaymentPending, |ctx| { ctx.put(ExitedPayment(true)); })
    // Closures run synchronously during transition — keep them lightweight
```

### `.build()`

**いつ使うか:** フローの宣言を終え、実行前に遷移とデータ依存の整合性を確かめるときに使います。`build()` は8項目以上の構造チェックを行い、各データ型の作成元と使用先を記録する DataFlowGraph を構築します。

```java
var def = builder.build();
// Throws FlowException with actionable error messages if invalid
```

```typescript
const def = builder.build();
// Throws FlowError with actionable error messages if invalid
```

```rust
let def = builder.build()?;
// Returns Err(FlowError) with actionable error messages if invalid
```

### `.warnings()`

**いつ使うか:** 構築後に、設計の見直しが必要かもしれない点を確認するときに使います。liveness（処理が先へ進める性質）の警告は、届かないかもしれない外部イベントを待つなど、フローが進まなくなるリスクを示します。

```java
var def = builder.build();
for (String w : def.warnings()) {
    log.warn("tramli: {}", w);
}
// "Perpetual flow 'circuitBreaker' has External transitions — liveness risk"
```

```typescript
const def = builder.build();
for (const w of def.warnings) {
    console.warn(`tramli: ${w}`);
}
// "Perpetual flow 'circuitBreaker' has External transitions — liveness risk"
```

```rust
let result = builder.build_and_validate();
for err in &result.errors {
    eprintln!("tramli: {} — {}", err.code, err.message);
}
// Use build_and_validate() for detailed structural diagnostics
```

---

## FlowEngine

定義したフローを、注文やログインなどの1件ごとに実行します。新しい実行の開始と、外部入力が届いたときの再開を担当します。

<a id="startflow--resumeandexecute"></a>

### `startFlow(definition, sessionId, initialData)`

**いつ使うか:** 新しい注文やログインに、独立した実行と初期データを用意するときに使います。開始すると、次の外部入力待ちや終了までの自動遷移（auto-chain）が実行されます。

```java
var flow = engine.startFlow(oidcFlow, "session-123",
    Map.of(OidcRequest.class, new OidcRequest("GOOGLE", "/")));
// Auto-chain fires: INIT → REDIRECTED (stops at External)
```

```typescript
const flow = await engine.startFlow(oidcFlow, 'session-123',
    Tramli.data([OidcRequest, { provider: 'GOOGLE', redirectUri: '/' }]));
// Auto-chain fires: INIT → REDIRECTED (stops at External)
```

```rust
let mut engine = FlowEngine::new(InMemoryFlowStore::new());
let flow_id = engine.start_flow(oidc_def.clone(), "session-123",
    vec![(TypeId::of::<OidcRequest>(), Box::new(OidcRequest { provider: "GOOGLE".into(), redirect_uri: "/".into() }) as Box<dyn CloneAny>)])?;
// Auto-chain fires: Init → Redirected (stops at External). Returns flow ID.
```

### `resumeAndExecute(flowId, definition, externalData)`

**いつ使うか:** 待機中のフローに外部からの応答が届いたときに使います。フロー ID とイベントのデータを渡すと、Guard が入力を検証し、その後の自動処理が実行されます。

```java
flow = engine.resumeAndExecute(flow.id(), oidcFlow,
    Map.of(OidcCallback.class, new OidcCallback("auth-code", "state")));
// Guard validates → auto-chain fires → COMPLETE
```

```typescript
const resumed = await engine.resumeAndExecute(flow.id, oidcFlow,
    Tramli.data([OidcCallback, { code: 'auth-code', state: 'state' }]));
// Guard validates → auto-chain fires → COMPLETE
```

```rust
engine.resume_and_execute(&flow_id,
    vec![(TypeId::of::<OidcCallback>(), Box::new(OidcCallback { code: "auth-code".into(), state: "state".into() }) as Box<dyn CloneAny>)])?;
// Guard validates → auto-chain fires → COMPLETE
let flow = engine.store.get(&flow_id).unwrap();
```

---

## FlowInstance

1回の実行について、現在の状態・結果・エラー・必要なデータを確認します。

<a id="currentstate--iscompleted--exitstate"></a>

### `currentState()`

**いつ使うか:** 支払い待ちかどうかなど、画面やハンドラが現在の段階を知りたいときに使います。進捗用のフラグを別に管理せず、インスタンスの状態を読みます。

```java
if (flow.currentState() == PAYMENT_PENDING) {
    return "Waiting for payment...";
}
```

```typescript
if (flow.currentState === 'PAYMENT_PENDING') {
    return 'Waiting for payment...';
}
```

```rust
let flow = engine.store.get(&flow_id).unwrap();
if flow.current_state() == PaymentPending {
    return "Waiting for payment...";
}
```

### `isCompleted()` / `exitState()`

**いつ使うか:** 未完了のフローと、完了・ブロック・期限切れで終了したフローを区別するときに使います。まず終了したかを確認し、終了状態に応じて後続処理を選びます。

```java
if (flow.isCompleted()) {
    switch (flow.exitState()) {
        case "COMPLETE" -> sendWelcomeEmail(flow);
        case "BLOCKED" -> notifySecurityTeam(flow);
        case "EXPIRED" -> log.warn("Flow timed out");
    }
}
```

```typescript
if (flow.isCompleted) {
    switch (flow.exitState) {
        case 'COMPLETE': sendWelcomeEmail(flow); break;
        case 'BLOCKED': notifySecurityTeam(flow); break;
        case 'EXPIRED': console.warn('Flow timed out'); break;
    }
}
```

```rust
if flow.is_completed() {
    match flow.exit_state() {
        Some("COMPLETE") => send_welcome_email(&flow),
        Some("BLOCKED") => notify_security_team(&flow),
        Some("EXPIRED") => eprintln!("Flow timed out"),
        _ => {}
    }
}
```

<a id="lasterror--activesubflow--statepath--statepathstring"></a>

### `lastError()`

**いつ使うか:** フローがエラー状態になり、記録された原因をログや調査で確認するときに使います。`lastError()` で、その失敗に対応するエラーの詳細を取得します。

```java
if (flow.currentState() == ERROR) {
    log.error("Flow failed: {}", flow.lastError());
    // "HttpTimeoutException: Connection timed out"
}
```

```typescript
if (flow.currentState === 'ERROR') {
    console.error(`Flow failed: ${flow.lastError}`);
    // "Error: Connection timed out"
}
```

```rust
if flow.current_state() == Error {
    if let Some(err) = flow.last_error() {
        eprintln!("Flow failed: {}", err);
        // "PROC_ERROR: Connection timed out"
    }
}
```

### `activeSubFlow()`

**いつ使うか:** 親が決済などの大きな段階にいて、その中で動く子フローを確認したいときに使います。Java/TypeScript は実行中の子を取得し、Rust の例は状態パスを使います。

```java
if (flow.activeSubFlow() != null) {
    log.info("In sub-flow, inner state: {}",
        flow.activeSubFlow().currentState());
}
```

```typescript
if (flow.activeSubFlow != null) {
    console.log(`In sub-flow, inner state: ${flow.activeSubFlow.currentState}`);
}
```

```rust
// Rust uses state_path() instead of activeSubFlow()
let path = flow.state_path();
if path.len() > 1 {
    println!("In sub-flow, inner state: {}", path.last().unwrap());
}
```

### `statePath()` / `statePathString()`

**いつ使うか:** 親の状態だけでは、子フローの待機位置が分からないときに使います。状態パスは `PAYMENT/CONFIRM` のように親と子の現在位置を並べ、ログや進捗表示に使えます。

```java
log.info("Flow at: {}", flow.statePathString());
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

```typescript
console.log(`Flow at: ${flow.statePathString()}`);
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

```rust
println!("Flow at: {}", flow.state_path_string());
// "PAYMENT/CONFIRM" — parent state / sub-flow state
```

<a id="waitingfor--availabledata--missingfor"></a>

### `waitingFor()`

**いつ使うか:** クライアントが、フローの待つ外部入力を知りたいときに使います。期待されるデータ型を調べ、次のイベントを準備します。

```java
Set<Class<?>> needed = flow.waitingFor();
// {OidcCallback.class} — client needs to send OAuth callback data
```

```typescript
const needed: string[] = flow.waitingFor();
// ['OidcCallback'] — client needs to send OAuth callback data
```

```rust
let needed: Vec<TypeId> = flow.waiting_for();
// [TypeId::of::<OidcCallback>()] — client needs to send OAuth callback data
```

### `availableData()`

**いつ使うか:** 現在の状態で利用可能と見込まれるデータ型を知りたいときに使います。このクエリはデータフローグラフを参照します。実際の保存値はコンテキストの取得 API で確認してください。

```java
Set<Class<?>> available = flow.availableData();
// {OidcRequest, OidcRedirect} — what's been produced so far
```

```typescript
const available: Set<string> = flow.availableData();
// Set {'OidcRequest', 'OidcRedirect'} — what's been produced so far
```

```rust
let available: HashSet<TypeId> = flow.available_data();
// HashSet containing TypeId::of::<OidcRequest>(), etc. — what's been produced so far
```

### `missingFor()`

**いつ使うか:** 処理が進まず、入力不足を疑っているときに使います。次の遷移が必要とするデータのうち、コンテキストに存在しない型を列挙します。

```java
Set<Class<?>> missing = flow.missingFor();
// {PaymentResult} — this type is required but not yet in context
```

```typescript
const missing: string[] = flow.missingFor();
// ['PaymentResult'] — this type is required but not yet in context
```

```rust
let missing: Vec<TypeId> = flow.missing_for();
// [TypeId::of::<PaymentResult>()] — this type is required but not yet in context
```

<a id="withversionn--set_versionn-rust--stateenteredat"></a>

### `withVersion(n)` / `set_version(n)` (Rust)

**いつ使うか:** FlowStore が保存した新しいバージョン番号を、メモリ上のインスタンスに反映するときに使います。楽観ロックはバージョン番号を照合して同時更新を検出する仕組みです。これらのメソッドで保存後の番号を設定します。

```java
// After SQL UPDATE ... SET version = version + 1
flow = flow.withVersion(flow.version() + 1);
```

```typescript
// After SQL UPDATE ... SET version = version + 1
const updated = flow.withVersion(flow.version + 1);
```

```rust
// After SQL UPDATE ... SET version = version + 1
let next_version = flow.version() + 1;
flow.set_version(next_version);
```

Rust の `set_version_public()` は、以前の呼び出し方を保つための非推奨の別名として残されています。

### `stateEnteredAt()`

**いつ使うか:** 外部からの応答が遅いときなど、現在の状態に入ってからの経過時間を調べる場合に使います。Java/TypeScript はその状態に入った時刻を取得できます。Rust の取得 API は内部用のため、下の例ではフロー開始からの経過時間を測ります。

```java
Instant entered = flow.stateEnteredAt();
Duration elapsed = Duration.between(entered, Instant.now());
log.info("Waiting for {} seconds", elapsed.getSeconds());
```

```typescript
const entered: Date = flow.stateEnteredAt;
const elapsedMs = Date.now() - entered.getTime();
console.log(`Waiting for ${Math.floor(elapsedMs / 1000)} seconds`);
```

```rust
// state_entered_at() is available to engine internals (pub(crate))
// For external timeout checks, compare flow.created_at with Instant::now()
let elapsed = flow.created_at.elapsed();
println!("Flow age: {} seconds", elapsed.as_secs());
```

---

## FlowContext

処理間で型付きのデータを受け渡します。各 Processor は必要な入力と出力を宣言し、対応する値をここで読み書きします。

<a id="get--find--put--has"></a>

### `get(key)` / `find(key)` / `put(key, value)` / `has(key)`

**いつ使うか:** Processor が前の処理の結果を読み、次の処理へデータを渡すときに使います。必須データは `get`、省略可能なデータは `find`、書き込みは `put`、存在確認は `has` を使います。

```java
// In a processor
OrderRequest req = ctx.get(OrderRequest.class);          // throws if missing
Optional<Coupon> coupon = ctx.find(Coupon.class);         // optional
ctx.put(PaymentIntent.class, new PaymentIntent("txn-1")); // write
if (ctx.has(FraudScore.class)) { ... }                    // check
```

```typescript
// In a processor — flowKey<T> gives full type inference
const req = ctx.get(OrderRequest);                           // throws if missing
const coupon = ctx.find(Coupon);                             // T | undefined
ctx.put(PaymentIntent, { transactionId: 'txn-1' });         // write
if (ctx.has(FraudScore)) { /* ... */ }                       // check
```

```rust
let req = ctx.get::<OrderRequest>()?;                        // returns Result — Err if missing
let coupon = ctx.find::<Coupon>();                            // Option<&Coupon>
ctx.put(PaymentIntent { transaction_id: "txn-1".into() });   // write (type inferred)
if ctx.has::<FraudScore>() { /* ... */ }                      // check
```

<a id="registeralias--toaliasmap--fromaliasmap"></a>

### `registerAlias(type, alias)` / `toAliasMap()` / `fromAliasMap(map)`

**いつ使うか:** コンテキストのデータを、読みやすい名前で JSON に保存したいときに使います。alias（別名）は型やキーに対応する文字列です。Java/TypeScript は別名を使うマップへの変換・復元ができ、Rust は自分でシリアライズするための対応表を取得できます。

Java の `aliasOf(type)` / `keyOfAlias(alias)` は登録済みの別名 / 型を取得し、未登録なら `null` を返します。

```java
// Setup (once)
ctx.registerAlias(OrderRequest.class, "OrderRequest");
ctx.registerAlias(PaymentIntent.class, "PaymentIntent");

// Save to DB
String json = objectMapper.writeValueAsString(ctx.toAliasMap());
// {"OrderRequest": {...}, "PaymentIntent": {...}}

// Load from DB
Map<String, Object> map = objectMapper.readValue(json, MAP_TYPE);
ctx.fromAliasMap(map);
```

```typescript
// Setup (once)
ctx.registerAlias(OrderRequest, 'OrderRequest');
ctx.registerAlias(PaymentIntent, 'PaymentIntent');

// Save to DB
const json = JSON.stringify(Object.fromEntries(ctx.toAliasMap()));
// {"OrderRequest": {...}, "PaymentIntent": {...}}

// Load from DB
const map = new Map(Object.entries(JSON.parse(json)));
ctx.fromAliasMap(map);
```

```rust
// Setup (once) — turbofish syntax specifies the Rust type
ctx.register_alias::<OrderRequest>("OrderRequest");
ctx.register_alias::<PaymentIntent>("PaymentIntent");

// Query alias ↔ TypeId mapping
ctx.alias_of(&TypeId::of::<OrderRequest>());       // Some("OrderRequest")
ctx.type_id_of_alias("OrderRequest");               // Some(&TypeId::of::<OrderRequest>())
// Use aliases to build your own JSON serialization layer
```

---

## DataFlowGraph

フローが宣言したデータ依存を理解したり、テストしたりするときに使うグラフです。クエリは型とその作成元・使用先を調べます。以下の検証用 API は、その宣言と実際のコンテキストを照合します。

<a id="クエリ系"></a>

### `availableAt(state)`

**いつ使うか:** 処理を追加する前に、その遷移元の状態へ至る全経路で利用できるデータ型を確認するときに使います。`availableAt` はフローを実行せず、定義から調べます。

```java
Set<Class<?>> available = graph.availableAt(PAYMENT_CONFIRMED);
// {OrderRequest, PaymentIntent, PaymentResult}
```

```typescript
const available: Set<string> = graph.availableAt('PAYMENT_CONFIRMED');
// Set {'OrderRequest', 'PaymentIntent', 'PaymentResult'}
```

```rust
let graph = def.data_flow_graph();
let available: HashSet<TypeId> = graph.available_at(PaymentConfirmed);
// Contains TypeId::of::<OrderRequest>(), TypeId::of::<PaymentIntent>(), ...

// Rust also has explain() for detailed diagnostics
let info = graph.explain(PaymentConfirmed);
// ExplainResult { state, available, missing: [MissingInfo { type_id, needed_by, reason }] }
```

### `producersOf(type)` / `consumersOf(type)`

**いつ使うか:** 型を変更する前に、その型を作る処理と読む処理を探すときに使います。作成元は `produces`、使用先は `requires` にその型を宣言しています。

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
// &[NodeInfo { name: "OrderInit", from_state: Created, to_state: PaymentPending, kind: "processor" }]

let consumers = graph.consumers_of(&TypeId::of::<PaymentIntent>());
// &[NodeInfo { name: "PaymentGuard", from_state: PaymentPending, to_state: Confirmed, kind: "guard" }]
```

### `deadData()`

**いつ使うか:** 後続の処理が使わないデータを作っていないか調べるときに使います。dead data は、作られるもののフロー内で必要と宣言されない型です。削除する前に、呼び出し元が最終結果として使っていないか確認してください。

```java
Set<Class<?>> dead = graph.deadData();
// {ShipmentInfo} — produced at SHIPPED but no downstream processor uses it
```

```typescript
const dead: Set<string> = graph.deadData();
// Set {'ShipmentInfo'} — produced at SHIPPED but no downstream processor uses it
```

```rust
let dead: HashSet<TypeId> = graph.dead_data();
// Contains TypeId::of::<ShipmentInfo>() — produced at Shipped but never consumed
```

### `lifetime(type)`

**いつ使うか:** データ型が最初に現れ、最後に使われる位置を知りたいときに使います。ここでの寿命（lifetime）はフロー内の位置を指し、経過時間ではありません。

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
// Some((PaymentPending, Confirmed)) — (first_produced, last_consumed)
```

### `pruningHints()`

**いつ使うか:** コンテキストのデータが増え、各状態で削除を検討する候補を知りたいときに使います。pruning は不要なデータを取り除くことです。このメソッドは候補を返すだけで、値を削除しません。

```java
Map<S, Set<Class<?>>> hints = graph.pruningHints();
// {SHIPPED: [OrderRequest, PaymentIntent]} — safe to remove after SHIPPED
```

```typescript
const hints: Map<string, Set<string>> = graph.pruningHints();
// Map {'SHIPPED' => Set {'OrderRequest', 'PaymentIntent'}} — safe to remove after SHIPPED
```

```rust
let hints: HashMap<OrderState, HashSet<TypeId>> = graph.pruning_hints();
// {Shipped: {TypeId::of::<OrderRequest>(), TypeId::of::<PaymentIntent>()}} — safe to prune
```

### `impactOf(type)`

**いつ使うか:** データ型を変更するときに、確認すべき作成元と使用先の一覧を得るために使います。`impactOf` は指定した型の依存関係を、両側からまとめます。

```java
var impact = graph.impactOf(PaymentIntent.class);
// producers: [OrderInit], consumers: [PaymentGuard]
```

```typescript
const impact = graph.impactOf(PaymentIntent);
// {producers: [{name: 'OrderInit', ...}], consumers: [{name: 'PaymentGuard', ...}]}
```

```rust
let (producers, consumers) = graph.impact_of(&TypeId::of::<PaymentIntent>());
// producers: [NodeInfo { name: "OrderInit", ... }], consumers: [NodeInfo { name: "PaymentGuard", ... }]
```

### `parallelismHints()`

**いつ使うか:** 2つの処理に宣言上のデータ依存があるか検討するときに使います。依存のない組を候補として返しますが、エンジンがそれらを並行実行するわけではありません。

```java
List<String[]> hints = graph.parallelismHints();
// [["RiskCheck", "AddressValidation"]] — no data dependency between them
```

```typescript
const hints: [string, string][] = graph.parallelismHints();
// [['RiskCheck', 'AddressValidation']] — no data dependency between them
```

```rust
let hints: Vec<(String, String)> = graph.parallelism_hints();
// [("RiskCheck", "AddressValidation")] — no data dependency between them
```

<a id="検証系"></a>

### `assertDataFlow(ctx, state)`

**いつ使うか:** 特定の状態でコンテキストに不足する値を、テストで検出したいときに使います。インスタンスをデータフロー上の期待値と照合し、返された不足型のリストが空であることを検査します。

```java
List<Class<?>> missing = graph.assertDataFlow(flow.context(), flow.currentState());
assertTrue(missing.isEmpty(), "Missing types: " + missing);
```

```typescript
const missing: string[] = graph.assertDataFlow(flow.context, flow.currentState);
expect(missing).toEqual([]);
```

```rust
let missing: Vec<TypeId> = graph.assert_data_flow(&flow.context, flow.current_state());
assert!(missing.is_empty(), "Missing types: {:?}", missing);
```

### `verifyProcessor(processor, ctx)`

**いつ使うか:** Processor が宣言した入出力が実際に揃っているか、テストで確認するときに使います。この API は Processor を実行し、必須入力の不足や宣言した出力の書き込み不足など、契約違反を報告します。

```java
List<String> violations = DataFlowGraph.verifyProcessor(orderInit, ctx);
// [] = OK, or ["put ShipmentInfo but did not declare it in produces()"]
```

```typescript
const violations: string[] = await DataFlowGraph.verifyProcessor(orderInit, ctx);
// [] = OK, or ['put ShipmentInfo but did not declare it in produces()']
```

```rust
let violations: Vec<String> = graph.verify_processor(&order_init, &mut ctx);
// [] = OK, or ["put ShipmentInfo but did not declare it in produces()"]
```

### `isCompatible(a, b)`

**いつ使うか:** 入力の要求を増やしたり、他で使う出力を減らしたりせずに Processor を置き換えたいときに使います。ここでの互換性はデータの宣言に関するものです。B の要求する入力は A 以下で、出力は A の出力をすべて含む必要があります。

```java
boolean ok = DataFlowGraph.isCompatible(orderInitV1, orderInitV2);
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

```typescript
const ok: boolean = DataFlowGraph.isCompatible(orderInitV1, orderInitV2);
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

```rust
let ok = DataFlowGraph::<OrderState>::is_compatible(
    v1.requires(), v1.produces(), v2.requires(), v2.produces());
// true if V2 requires ⊆ V1 requires AND V1 produces ⊆ V2 produces
```

<a id="移植支援系"></a>

### `migrationOrder()`

**いつ使うか:** フローを別言語へ移植する際に、データ依存に沿って実装順序を決めるために使います。作成元を、その出力を使う処理より先に並べた順序を返します。

```java
List<String> order = graph.migrationOrder();
// ["OrderInit", "PaymentGuard", "TokenExchange", ...] — dependency order
```

```typescript
const order: string[] = graph.migrationOrder();
// ['OrderInit', 'PaymentGuard', 'TokenExchange', ...] — dependency order
```

```rust
let order: Vec<String> = graph.migration_order();
// ["OrderInit", "PaymentGuard", "TokenExchange", ...] — topological dependency order
```

### `testScaffold()`

**いつ使うか:** Processor のテストにどの入力を準備すればよいか、確認するときに使います。scaffold はテスト準備のひな形です。このメソッドは必要なデータ型を列挙し、具体的な値は自分で用意します。

```java
Map<String, List<String>> scaffold = graph.testScaffold();
// {"OrderInit": ["OrderRequest"], "PaymentGuard": ["PaymentIntent"]}
```

```typescript
const scaffold: Map<string, string[]> = graph.testScaffold();
// Map {'OrderInit' => ['OrderRequest'], 'PaymentGuard' => ['PaymentIntent']}
```

```rust
let scaffold: HashMap<String, Vec<String>> = graph.test_scaffold();
// {"OrderInit": ["OrderRequest"], "PaymentGuard": ["PaymentIntent"]}
```

### `generateInvariantAssertions()`

**いつ使うか:** 各状態にあるべきデータを、テストのチェックリストとして得るために使います。不変条件（invariant）は、その状態で必ず満たすべき条件です。このメソッドは条件を文字列で返し、検査を書く材料にできます。

```java
List<String> assertions = graph.generateInvariantAssertions();
// ["At state CONFIRMED: context must contain [OrderRequest, PaymentIntent, PaymentResult]"]
```

```typescript
const assertions: string[] = graph.generateInvariantAssertions();
// ['At state CONFIRMED: context must contain [OrderRequest, PaymentIntent, PaymentResult]']
```

```rust
let assertions: Vec<String> = graph.generate_invariant_assertions();
// ["At state Confirmed: context must contain [OrderRequest, PaymentIntent, PaymentResult]"]
```

### `crossFlowMap(graphs...)`

**いつ使うか:** 別々のフローがデータをやり取りし、対応する作成元と使用先を知りたいときに使います。あるフローが作り、別のフローが必要とする型を報告します。データを転送する API ではありません。

```java
var deps = DataFlowGraph.crossFlowMap(orderGraph, refundGraph);
// ["ShipmentInfo: flow 0 produces → flow 1 consumes"]
```

```typescript
const deps: string[] = DataFlowGraph.crossFlowMap(orderGraph, refundGraph);
// ['ShipmentInfo: flow 0 produces → flow 1 consumes']
```

> **注:** `crossFlowMap()` は現在 Java/TypeScript のみで使えます。

### `diff(before, after)`

**いつ使うか:** フロー定義の変更でデータ依存がどう変わったか、レビューで具体的に確認するときに使います。グラフを比較し、追加・削除を言語ごとの結果形式で調べます。

```java
var result = DataFlowGraph.diff(v1Graph, v2Graph);
// addedTypes: {FraudScore}, removedTypes: {}, addedEdges: {...}
```

```typescript
const result = DataFlowGraph.diff(v1Graph, v2Graph);
// {addedTypes: Set {'FraudScore'}, removedTypes: Set {}, addedEdges: Set {...}, ...}
```

```rust
let (added, removed) = DataFlowGraph::diff(&v1_graph, &v2_graph);
// added: ["FraudScore"], removed: [] — type-level additions/removals
```

### `versionCompatibility(v1, v2)`

**いつ使うか:** 古いインスタンスが待機中のまま、定義を更新するときに使います。移行を計画する前に、新しい定義がある状態で期待するデータを、古いインスタンスが持っていない可能性を調べます。

```java
var issues = DataFlowGraph.versionCompatibility(v1Graph, v2Graph);
// ["State CONFIRMED: v2 expects FraudScore but v1 instances may not have it"]
```

```typescript
const issues: string[] = DataFlowGraph.versionCompatibility(v1Graph, v2Graph);
// ['State CONFIRMED: v2 expects FraudScore but v1 instances may not have it']
```

> **注:** `versionCompatibility()` は現在 Java/TypeScript のみで使えます。Rust では `diff()` と `explain()` を組み合わせて移行を分析します。

<a id="出力系"></a>

### `toMermaid()` / `toJson()` / `toMarkdown()`

**いつ使うか:** データ依存の分析結果を文書で共有したり、別のツールで読み込んだりするときに使います。Mermaid はテキストで図を記述する形式、JSON は構造化データ、Markdown は読みやすいチェックリストを出力します。

```java
String mermaid = graph.toMermaid();     // flowchart LR (Mermaid)
String json = graph.toJson();           // structured JSON for tooling
String md = graph.toMarkdown();         // migration checklist
```

```typescript
const mermaid: string = graph.toMermaid();   // flowchart LR (Mermaid)
const json: string = graph.toJson();         // structured JSON for tooling
const md: string = graph.toMarkdown();       // migration checklist
```

```rust
let mermaid: String = graph.to_mermaid();    // flowchart LR (Mermaid)
let json: String = graph.to_json();          // structured JSON for tooling
let md: String = graph.to_markdown();        // migration checklist
```

### `renderDataFlow(renderer)` / `toRenderable()`

**いつ使うか:** 文書や UI に、組み込みの出力とは違う図形式が必要なときに使います。レンダラーはグラフのデータをその形式に変換する関数で、Graphviz の dot、PlantUML の図のテキスト、D3.js の可視化用データなどを作れます。

```java
// Graphviz dot
String dot = graph.renderDataFlow(g -> {
    var sb = new StringBuilder("digraph {\n");
    for (var edge : g.edges()) {
        sb.append("  \"").append(edge.from()).append("\" -> \"")
          .append(edge.to()).append("\" [label=\"").append(edge.kind()).append("\"];\n");
    }
    return sb.append("}").toString();
});
```

> **注:** `renderDataFlow()` は Java のみで使えます。TypeScript と Rust では `toJson()` で構造化データを取得し、JSON を解析して独自のレンダラーを作ります。

---

## FlowDefinition

構築済みの定義から、許可された経路を調べたり、子フローを追加したりします。元の定義を作る手順は、上の Builder のレシピを参照してください。

### `renderStateDiagram(renderer)`

**いつ使うか:** 許可された状態遷移を独自の形式で描くときに使います。レンダラーは定義を受け取り、遷移を Graphviz の dot や PlantUML などの図のテキストへ変換します。

```java
String dot = definition.renderStateDiagram(d -> {
    var sb = new StringBuilder("digraph {\n");
    for (var t : d.transitions()) {
        sb.append("  ").append(t.from()).append(" -> ").append(t.to());
        if (!t.label().isEmpty()) sb.append(" [label=\"").append(t.label()).append("\"]");
        sb.append(";\n");
    }
    return sb.append("}").toString();
});
```

> **注:** `renderStateDiagram()` は Java のみで使えます。TypeScript では `definition.transitions` を直接たどります。Rust では Mermaid 出力に `graph.to_mermaid()`、独自の描画に `graph.to_json()` を使います。

```typescript
let dot = 'digraph {\n';
for (const t of definition.transitions) {
    dot += `  ${t.from} -> ${t.to}`;
    if (t.processor) dot += ` [label="${t.processor.name}"]`;
    dot += ';\n';
}
dot += '}';
```

```rust
// Use DataFlowGraph for diagram generation
let graph = def.data_flow_graph();
let mermaid = graph.to_mermaid();  // stateDiagram-v2 format
let json = graph.to_json();        // structured data for custom renderers
```

### `withPlugin(from, to, pluginFlow)`

**いつ使うか:** 発送前のギフト包装など、フローに処理を追加したいときに使います。プラグインフローは、指定した遷移に挿入する子フローです。Java/TypeScript は `withPlugin` を使い、Rust の例では Builder で子フローを宣言します。

```java
var extended = baseFlow.withPlugin(CONFIRMED, SHIPPED, giftWrappingFlow);
// CONFIRMED → [giftWrapping sub-flow] → SHIPPED
```

```typescript
const extended = baseFlow.withPlugin('CONFIRMED', 'SHIPPED', giftWrappingFlow);
// CONFIRMED → [giftWrapping sub-flow] → SHIPPED
```

```rust
// In Rust, use sub_flow() in the builder to embed child flows:
.from(Confirmed).sub_flow(Box::new(SubFlowAdapter::new(gift_wrapping_def)))
    .on_exit("DONE", Shipped)
    .end_sub_flow()
```

---

## ロギング

ロガーのコールバックで、実行時のイベントを既存のログや監視ツールへ送ります。進捗・イベントの検証・データの書き込み・失敗など、調べたい内容に応じてコールバックを選びます。

### `setTransitionLogger(entry -> ...)`

**いつ使うか:** 実行がどの経路を通ったか、後から調べるときに使います。フロー ID・遷移元・遷移先・遷移のきっかけを記録するコールバックを登録します。

```java
engine.setTransitionLogger(entry ->
    log.info("[{}:{}] {} → {} ({})", entry.flowName(), entry.flowId(), entry.from(), entry.to(), entry.trigger()));
// [oidc:abc123] CREATED → PAYMENT_PENDING (OrderInit)
```

```typescript
engine.setTransitionLogger(entry =>
    console.log(`[${entry.flowName}:${entry.flowId}] ${entry.from} → ${entry.to} (${entry.trigger})`));
// [oidc:abc123] CREATED → PAYMENT_PENDING (OrderInit)
```

```rust
engine.set_transition_logger(|entry|
    println!("[{}:{}] {} → {} ({})", entry.flow_name, entry.flow_id, entry.from, entry.to, entry.trigger));
// [oidc:abc123] Created → PaymentPending (OrderInit)
```

### `setGuardLogger(entry -> ...)`

**いつ使うか:** 外部からの応答が届いたのに、フローが進まないときに使います。Guard の結果と理由を記録し、入力が受け入れられたか拒否されたかを調べます。

```java
engine.setGuardLogger(entry ->
    log.info("[{}] guard {} at {}: {} ({})",
        entry.flowId(), entry.guardName(), entry.state(), entry.result(), entry.reason()));
// [abc123] guard PaymentGuard at PAYMENT_PENDING: rejected (Insufficient funds)
```

```typescript
engine.setGuardLogger(entry =>
    console.log(`[${entry.flowId}] guard ${entry.guardName} at ${entry.state}: ${entry.result} (${entry.reason})`));
// [abc123] guard PaymentGuard at PAYMENT_PENDING: rejected (Insufficient funds)
```

```rust
engine.set_guard_logger(|entry|
    println!("[{}] guard {} at {}: {} ({:?})",
        entry.flow_id, entry.guard_name, entry.state, entry.result, entry.reason));
// [abc123] guard PaymentGuard at PaymentPending: rejected (Some("Insufficient funds"))
```

### `setStateLogger(entry -> ...)`

**いつ使うか:** 後の処理で必要なデータが見つからず、コンテキストへの書き込みを追跡したいときに使います。状態ロガーは、実行中の状態に対応するデータの追加を報告します。

```java
engine.setStateLogger(entry ->
    log.debug("[{}] {}: put {} ({})",
        entry.flowId(), entry.state(), entry.typeName(), entry.type()));
// [abc123] CREATED: put PaymentIntent (class com.example.PaymentIntent)
```

```typescript
engine.setStateLogger(entry =>
    console.debug(`[${entry.flowId}] ${entry.state}: put ${entry.key}`));
// [abc123] CREATED: put PaymentIntent
```

```rust
engine.set_state_logger(|entry|
    println!("[{}] {}: put data", entry.flow_id, entry.state));
```

### `setErrorLogger(entry -> ...)`

**いつ使うか:** フローの失敗をアプリの監視に表示したり、通知サービスに送ったりするときに使います。そのサービスへエラーイベントを送るコールバックを登録します。

```java
engine.setErrorLogger(entry ->
    alertService.send("Flow error: " + entry.trigger() + " at " + entry.from()));
```

```typescript
engine.setErrorLogger(entry =>
    alertService.send(`Flow error: ${entry.trigger} at ${entry.from}`));
```

```rust
engine.set_error_logger(|entry|
    eprintln!("Flow error: {} at {} (cause: {:?})", entry.trigger, entry.from, entry.cause));
```

### `removeAllLoggers()`

**いつ使うか:** テストや特定の実行環境で、設定済みのロガーの呼び出しを止めたいときに使います。エンジンからロガーのコールバックをすべて解除します。

```java
engine.removeAllLoggers();
```

```typescript
engine.removeAllLoggers();
```

```rust
engine.remove_all_loggers();
```

---

## Pipeline

入力と出力を宣言した処理を、決まった順序で実行するときに使います。状態の enum や外部イベントによる遷移を定義せずに、データ依存を検証できます。

### `Tramli.pipeline(name).step(...).build()`

**いつ使うか:** CSV の取り込みなど、いつも同じ順序で処理を進め、外部イベントを待たない場合に使います。ステップを順番に定義し、`build()` で実行前にデータ依存を検証します。

```java
var pipeline = Tramli.pipeline("csv-import")
    .initiallyAvailable(RawInput.class)
    .step(parse).step(validate).step(enrich).step(save)
    .build();
FlowContext result = pipeline.execute(Map.of(RawInput.class, rawData));
```

```typescript
const pipeline = Tramli.pipeline('csv-import')
    .initiallyAvailable(RawInput)
    .step(parse).step(validate).step(enrich).step(save)
    .build();
const result = await pipeline.execute(Tramli.data([RawInput, rawData]));
```

```rust
let pipeline = PipelineBuilder::new("csv-import")
    .initially_available(requires![RawInput])
    .step(Box::new(parse)).step(Box::new(validate))
    .step(Box::new(enrich)).step(Box::new(save))
    .build()?;
let result = pipeline.execute(vec![
    (TypeId::of::<RawInput>(), Box::new(raw_data) as Box<dyn CloneAny>),
])?;
```

### `PipelineException`

**いつ使うか:** Pipeline が失敗し、失敗したステップと完了済みのステップを知りたいときに使います。Java/TypeScript は途中結果のコンテキストも取得でき、Rust はステップ名と元のエラーを取得できます。

```java
try {
    pipeline.execute(data);
} catch (PipelineException e) {
    log.error("Failed at step '{}' after completing {}",
        e.failedStep(), e.completedSteps());
    // Partial results available via e.context()
}
```

```typescript
try {
    await pipeline.execute(data);
} catch (e) {
    if (e instanceof PipelineException) {
        console.error(`Failed at step '${e.failedStep}' after completing ${e.completedSteps}`);
        // Partial results available via e.context
    }
}
```

```rust
match pipeline.execute(data) {
    Err(e) => {
        eprintln!("Failed at step '{}' after completing {:?}", e.failed_step, e.completed_steps);
        // e.cause is a FlowError with the original error details
    }
    Ok(ctx) => { /* use result context */ }
}
```

### `pipeline.dataFlow().deadData()`

**いつ使うか:** 後続のステップが入力として宣言していない出力を調べるときに使います。不要と判断する前に、呼び出し元が Pipeline の結果として使っていないか確認してください。

```java
Set<Class<?>> dead = pipeline.dataFlow().deadData();
// Types produced by a step but never required by downstream steps
```

```typescript
const dead: Set<string> = pipeline.dataFlow().deadData();
// Types produced by a step but never required by downstream steps
```

```rust
let dead: HashSet<TypeId> = pipeline.data_flow().dead_data();
// TypeIds produced by a step but never required by downstream steps
```

### `pipeline.asStep()`

**いつ使うか:** 既存の処理の並びを、大きな Pipeline の1ステップとして再利用するときに使います。`asStep()` はその Pipeline をステップのインターフェースに合わせます。

```java
PipelineStep auth = authPipeline.asStep();
var main = Tramli.pipeline("request")
    .step(auth)            // auth pipeline as a single step
    .step(processAction)
    .build();
```

```typescript
const auth = authPipeline.asStep();
const main = Tramli.pipeline('request')
    .step(auth)            // auth pipeline as a single step
    .step(processAction)
    .build();
```

> **注:** `asStep()` は Java/TypeScript のみで使えます。Rust では `PipelineStep` を実装する newtype（ラッパー用の struct）で `Pipeline` を包み、同じように組み合わせます。

### `pipeline.setStrictMode(true)`

**いつ使うか:** 依存関係の検証は通るものの、ステップが宣言した出力を書き忘れる可能性があるときに使います。strictMode（厳格モード）は、各ステップの実行後に、宣言した出力が存在するかを実行時に検査します。

```java
pipeline.setStrictMode(true);
pipeline.execute(data);
// Throws PipelineException if a step doesn't put its declared produces
```

```typescript
pipeline.setStrictMode(true);
await pipeline.execute(data);
// Throws PipelineException if a step doesn't put its declared produces
```

```rust
pipeline.set_strict_mode(true);
pipeline.execute(data)?;
// Returns Err(PipelineError) if a step doesn't put its declared produces
```

---

## コード生成

フロー定義を基に、図や実装のひな形を生成します。以下のレシピで各生成器の出力を確認できます。Processor の業務処理は自分で実装します。

### `MermaidGenerator.generate(definition)`

**いつ使うか:** 手書きの状態遷移図が、定義の変更に追い付かなくなっているときに使います。定義から Mermaid 形式の図のテキストを生成し、文書に載せます。

```java
String mermaid = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 format — paste into GitHub Markdown
```

```typescript
const mermaid: string = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 format — paste into GitHub Markdown
```

```rust
let mermaid: String = MermaidGenerator::generate(&oidc_def);
// stateDiagram-v2 format — paste into GitHub Markdown

// v1.8.0+: explicit view selection via MermaidView enum
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::State);
```

### `MermaidGenerator.generateDataFlow(definition)`

**いつ使うか:** どの処理がデータを用意し、どの処理がそれを読むか、レビューで確認するときに使います。宣言された `requires` と `produces` の関係を図にします。

```java
String mermaid = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — shows which data flows between processors
```

```typescript
const mermaid: string = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — shows which data flows between processors
```

```rust
let mermaid: String = MermaidGenerator::generate_data_flow(&oidc_def);
// flowchart LR — shows which data flows between processors

// or via MermaidView
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::DataFlow);
```

### `MermaidGenerator.generateExternalContract(definition)`

**いつ使うか:** 外部コールバックを組み込む人に、その境界でのデータの契約を伝えるときに使います。Guard が必要とする入力と、検証後に用意する出力を図にして、宣言を確認できるようにします。

```java
String mermaid = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

```typescript
const mermaid: string = MermaidGenerator.generateExternalContract(oidcFlow);
// Shows guard requires (client sends) and produces (client receives)
```

### `SkeletonGenerator.generate(definition, language)`

**いつ使うか:** 同じフローを別言語で実装する際に、Processor の宣言を出発点として用意するときに使います。スケルトンは実装のひな形です。生成後に業務処理を書き込みます。

```java
String rust = SkeletonGenerator.generate(oidcFlow, Language.RUST);
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

```typescript
const rust: string = SkeletonGenerator.generate(oidcFlow, 'rust');
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

---

## FlowErrorType

**いつ使うか:** 再試行で回復しうる失敗と、処理を終えるべき失敗を区別するときに使います。`RETRYABLE` は前者、`FATAL` は後者です。Rust ではこの enum の代わりに、エラーコード文字列と遷移先を選ぶ述語を使います。

```java
try {
    externalService.call();
} catch (SocketTimeoutException e) {
    throw new FlowException("TIMEOUT", "Service timed out", e)
        .withErrorType(FlowErrorType.RETRYABLE);
} catch (AuthenticationException e) {
    throw new FlowException("AUTH_FAILED", "Bad credentials", e)
        .withErrorType(FlowErrorType.FATAL);
}

// In error handler:
if (flow.lastError() != null) {
    // Route based on error type in onStepError
}
```

```typescript
try {
    await externalService.call();
} catch (e) {
    if (e instanceof TimeoutError) {
        throw new FlowError('TIMEOUT', 'Service timed out')
            .withErrorType('RETRYABLE');
    }
    throw new FlowError('AUTH_FAILED', 'Bad credentials')
        .withErrorType('FATAL');
}

// In error handler:
if (flow.lastError != null) {
    // Route based on error type in onStepError
}
```

```rust
// Rust has no FlowErrorType enum — use descriptive code strings instead.
// In a processor:
if timed_out {
    return Err(FlowError::with_source("TIMEOUT", "Service timed out", io_err));
}
return Err(FlowError::new("AUTH_FAILED", "Bad credentials"));

// In FlowDefinition — route by predicate on error code:
.on_step_error(TokenExchange, |e| e.code == "TIMEOUT", "Timeout", RetriableError)
.on_step_error(TokenExchange, |e| e.code == "AUTH_FAILED", "AuthFailed", TerminalError)
// Unmatched errors fall through to on_error / on_any_error
```
