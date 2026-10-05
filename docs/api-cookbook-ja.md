# tramli API クックブック

tramli を初めて使う方や、フローを実装・調査しているエンジニア向けの使用例集です。
やりたいことから主要 API を探し、使う場面と呼び出し方を確認できます。

**網羅版は英語版（[api-cookbook.md](api-cookbook.md)）です。** 日本語版は主要なレシピをまとめており、英語版の全訳ではありません。

## この文書の使い方・読む順番

必要なレシピは、下の対応表から探せます。各レシピは使う場面の説明から始まり、言語別のコード例が続きます。例中の `OrderRequest` や `orderInit` など、アプリ固有の型や処理は定義済みとして読んでください。

初めて読む場合は、次の順番を勧めます。

1. [README のクイックスタート](../README-ja.md#クイックスタート)でフロー全体を動かし、[FlowDefinition Builder](#flowdefinition-builder) と [FlowContext](#flowcontext) で遷移とデータの定義を確認します。
2. [FlowEngine](#flowengine) と [FlowInstance](#flowinstance) で、開始・外部イベントによる再開・進捗の確認を読みます。
3. 依存関係の確認や不具合の調査が必要になったら、[DataFlowGraph](#dataflowgraph) と[ロギング](#ロギング)を読みます。外部入力を待たない直列処理なら、[Pipeline](#pipeline) から始められます。

Rust を使う場合は、Builder に処理を登録する前に[trait の実装例](#rust-processorguardbranch-の実装パターン)を確認してください。

## やりたいことから探す

| やりたいこと | 該当セクション |
|--------------|----------------|
| Rust で処理・外部イベントの検証・分岐を実装する | [Rust の実装パターン](#rust-processorguardbranch-の実装パターン) |
| 自動で進める・外部イベントを待つ・条件で進路を分ける | [FlowDefinition Builder](#flowdefinition-builder) |
| 子フローを組み合わせて処理を再利用する | [SubFlow](#fromstatesubflowdefonexitx-sendsubflow) |
| エラー時の遷移先を決める | [エラー遷移の定義](#onerrorfrom-to--onsteperrorfrom-exceptionclass-to--onanyerrorstate)、[エラー分類](#flowerrortype) |
| 初期データ・有効期限・拒否回数の上限を決め、定義を検証する | [Builder の設定と構築](#initiallyavailabletypes--setttlms--setmaxguardretriesn--build) |
| フローを開始し、外部からの応答で再開する | [FlowEngine](#flowengine) |
| 進捗・エラー・次に必要なデータを調べる | [FlowInstance](#flowinstance) |
| 処理間でデータを渡す・保存用の形式に変換する | [FlowContext](#flowcontext) |
| データの作成元・使用先・不要な出力・変更の影響を調べる | [DataFlowGraph のクエリ系](#クエリ系) |
| データの宣言を検証する・移植やバージョン更新を準備する | [検証系](#検証系)、[移植支援系](#移植支援系) |
| 遷移・イベントの拒否・データの書き込み・エラーを記録する | [ロギング](#ロギング) |
| 直列処理を実行し、ステップ間の依存関係を検証する | [Pipeline](#pipeline) |
| 図や Processor の実装ひな形を生成する | [コード生成](#コード生成)、[DataFlowGraph の出力系](#出力系) |

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
- **Rust:** 型を識別する `TypeId` を使い、データは `ctx.get::<T>()` で読みます。`requires![]` は型のリストを作るマクロ、trait は処理が実装すべき振る舞いの定義です。`Arc<FlowDefinition<S>>` は参照カウントによって定義を複数スレッドで安全に共有します。

メソッド名・戻り値・利用できる補助 API は言語ごとに異なります。使用する言語の例と、その前後にある注記を確認してください。

---

## Rust: Processor・Guard・Branch の実装パターン

**いつ使うか:** Rust で自動処理・外部イベントの検証・条件分岐を実装し、Builder に登録するときに使います。trait は実装すべきメソッドの定義で、各処理を担う struct に実装します。

- `StateProcessor` は注文から決済用データを作るなどの自動処理に使います。`process` に処理を書き、`requires` と `produces` で入力と出力の型を宣言します。
- `TransitionGuard` は決済通知などの外部入力を検証するときに使います。`validate` は受け入れ時の出力、または拒否理由を返します。
- `BranchProcessor` はリスクスコアなどに応じて進路を選ぶときに使います。`decide` が返したラベルに、Builder 側で遷移先を対応付けます。

子フローを実行する `SubFlowRunner` は、通常は `SubFlowAdapter` を使って組み込みます。独自実装がある場合、v1.8.0 からは生成メソッド名が `create_instance()` になっている点を確認してください。

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

状態遷移・初期データ・エラー時の進路を1か所に宣言します。最後に `build()` を呼び、実行前に定義を検証します。

### `from(state).auto(to, processor)`

**いつ使うか:** 決済リクエストの作成など、その状態に入ったら外部からの応答を待たずに実行したい処理に使います。Auto 遷移は Processor を実行し、次の状態へ進みます。

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit 実行 → PAYMENT_PENDING
```

```typescript
.from('CREATED').auto('PAYMENT_PENDING', orderInit)
// CREATED → OrderInit 実行 → PAYMENT_PENDING
```

### `from(state).external(to, guard)`

**いつ使うか:** 決済通知やユーザー操作が届くまで、次の処理に進めないときに使います。External 遷移は `resumeAndExecute()` で渡されたデータを Guard が検証してから進みます。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// PAYMENT_PENDING で停止、resumeAndExecute() が呼ばれるまで待機
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard)
// PAYMENT_PENDING で停止、resumeAndExecute() が呼ばれるまで待機
```

### `from(state).external(to, guard, timeout)`

**いつ使うか:** 決済通知など、特定の応答待ちに期限を設けたいときに使います。この External 遷移にタイムアウトを指定し、時間内にイベントが来なければフローを期限切れにします。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard, Duration.ofMinutes(5))
// 5分以内に決済完了しなければ EXPIRED
```

```typescript
.from('PAYMENT_PENDING').external('CONFIRMED', paymentGuard, { timeout: 5 * 60_000 })
// 5分以内に決済完了しなければ EXPIRED
```

### `from(state).branch(branch).to(s, label).endBranch()`

**いつ使うか:** リスクスコアによって追加認証を求めるなど、手元のデータで次の処理を選ぶときに使います。Branch が返すラベルに、遷移先の状態と必要な処理を対応付けます。

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

**いつ使うか:** 決済のように独自の手順を持つ処理を、大きなフローの中で再利用するときに使います。子フローが終了した状態（終端状態）を、親フローの次の状態に対応付けます。

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

**いつ使うか:** タイムアウトなら再試行の経路、不正な認証情報なら終了の経路というように、失敗時の進路を決めるときに使います。発生した状態や例外の型に応じて遷移先を指定します。

- `onError` は、ある状態で発生したエラーの遷移先を指定します。
- `onStepError` は、同じ状態でも例外の型ごとに遷移先を分けます。
- `onAnyError` は、個別の設定で扱わないエラーの遷移先をまとめて指定します。これがコード中のフォールバック（個別条件に当てはまらない場合の処理）です。

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

**いつ使うか:** 初期入力や待機の上限を決め、実行前にフロー定義の矛盾を見つけたいときに使います。設定を終えたら `build()` を呼び、状態遷移や全経路のデータ依存など、8 項目を検証します。

- `initiallyAvailable` は、開始時に呼び出し元が渡すデータの型を宣言します。実際の値は `startFlow` に渡します。
- `ttl` / `setTtl` の TTL（time-to-live）はフロー全体の有効期間です。1つの External 遷移の待機時間とは別に指定します。
- `maxGuardRetries` / `setMaxGuardRetries` は Guard の拒否回数の上限です。外部リクエストを自動で再送する設定ではありません。
- `warnings` では構築後の警告を確認します。liveness（処理が先へ進める性質）の警告は、外部イベントを待ち続けて進まなくなる可能性などを知らせます。

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

定義したフローを、注文やログインなどの1件ごとに実行します。新しい実行の開始と、待機中の実行の再開を担当します。

### `startFlow` / `resumeAndExecute`

**いつ使うか:** 注文やログインを新しく始めるときは `startFlow`、待機中の処理に外部からの応答を渡すときは `resumeAndExecute` を使います。開始後や Guard の検証後は、次の外部入力待ちや終了まで自動遷移が連続して実行されます。

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

1回の実行について、現在位置・結果・エラー・必要なデータを確認します。

### `currentState()` / `isCompleted()` / `exitState()`

**いつ使うか:** 画面に進捗を表示したり、成功と期限切れで後続処理を分けたりするときに使います。現在位置は `currentState()`、終了したかどうかは `isCompleted()`、終了結果は `exitState()` で確認します。

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

**いつ使うか:** エラーの原因や、親フローだけでは見えない子フローの進捗を調べるときに使います。`lastError()` は記録されたエラー、`activeSubFlow()` は実行中の子フロー、状態パスは `PAYMENT/CONFIRM` のような親と子の現在位置を示します。

```java
log.error("エラー: {}", flow.lastError());              // "HttpTimeoutException: Connection timed out"
log.info("状態パス: {}", flow.statePathString());        // "PAYMENT/CONFIRM"
```

```typescript
console.error(`エラー: ${flow.lastError}`);              // "Error: Connection timed out"
console.log(`状態パス: ${flow.statePathString()}`);      // "PAYMENT/CONFIRM"
```

### `waitingFor()` / `availableData()` / `missingFor()`

**いつ使うか:** クライアントが次に送るべきデータや、処理が進まない原因になっている入力不足を調べるときに使います。

- `waitingFor()` は、待機中の External 遷移に必要な入力の型を示します。
- `availableData()` は、現在の状態で利用可能とデータフローグラフから判断される型を示します。実際の保存値はコンテキストから取得します。
- `missingFor()` は、次の遷移が必要とするデータのうち、コンテキストに存在しない型を示します。

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

### `withVersion(n)` / `set_version(n)` (Rust) / `stateEnteredAt()`

**いつ使うか:** 保存したバージョン番号を実行中のインスタンスに反映したり、現在の状態での待機時間を測ったりするときに使います。FlowStore の楽観ロックは、保存時にバージョン番号を照合して同時更新を検出する仕組みです。

`withVersion(n)` / `set_version(n)` は保存後の番号を設定します。Java/TypeScript の `stateEnteredAt()` は現在の状態に入った時刻で、フローを開始した時刻とは区別します。

```java
flow = flow.withVersion(flow.version() + 1);  // DB save 後
Duration elapsed = Duration.between(flow.stateEnteredAt(), Instant.now());
```

```typescript
const updated = flow.withVersion(flow.version + 1);  // DB save 後
const elapsedMs = Date.now() - flow.stateEnteredAt.getTime();
```

```rust
let next_version = flow.version() + 1;
flow.set_version(next_version);  // DB save 後
```

Rust の `set_version_public()` は、以前の呼び出し方を保つための非推奨の別名として残されています。

---

## FlowContext

処理間で型付きのデータを受け渡します。Processor が宣言した入力と出力に対応する値を、ここで読み書きします。

### `get` / `find` / `put` / `has`

**いつ使うか:** Processor が前の処理の結果を読み、次の処理へデータを渡すときに使います。必須データは `get`、省略可能なデータは `find`、書き込みは `put`、存在確認は `has` を使います。

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

**いつ使うか:** コンテキストのデータを、読みやすい名前を付けて JSON に保存したいときに使います。alias（別名）は型やキーに対応する文字列で、`registerAlias` で登録し、`toAliasMap` / `fromAliasMap` でその名前を使うマップへ変換・復元します。

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

各処理の `requires` / `produces` から、データの作成元と使用先を調べるためのグラフです。クエリは宣言上の関係を調べ、検証用の API はその宣言と実際のコンテキストを照合します。

### クエリ系

**いつ使うか:** 処理を追加する前に使えるデータを調べたり、型の変更がどの処理に影響するかを確認したりするときに使います。

- `availableAt` は、その状態に至る全経路で利用できる型を調べます。`producersOf` / `consumersOf` は、指定した型の作成元と使用先を調べます。
- `deadData` は、作られるもののフロー内で必要とされない型を見つけます。呼び出し元に返す最終結果として使っていないかも確認してください。
- `lifetime` は、データが最初に作られ、最後に使われる状態を調べます。ここでの寿命は経過時間ではありません。
- `pruningHints` は、コンテキストに残すデータを減らしたいときの候補を返します。pruning は不要なデータを取り除くことで、この API 自体は値を削除しません。
- `impactOf` は、型を変更するときに確認すべき作成元と使用先をまとめます。
- `parallelismHints` は、宣言上のデータ依存がない処理の組を探します。並行化を検討する材料であり、自動で並行実行する設定ではありません。

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

**いつ使うか:** 宣言どおりのデータが実際に存在するかテストしたり、Processor を入れ替えても入出力の依存関係を保てるか確認したりするときに使います。

- `assertDataFlow` は、その状態にあるはずのデータとコンテキストを照合し、不足する型を返します。不変条件とは、その状態で必ず満たすべき条件のことです。
- `verifyProcessor` は Processor を実行し、宣言した入力や実行後の出力が存在するかなどを検証します。
- `isCompatible` は、置き換え後の Processor が入力を追加で要求せず、元の出力をすべて用意するかを検査します。業務処理の結果が同じかどうかは別途テストします。

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

**いつ使うか:** 別言語への移植順序を決めたり、定義の更新が実行中のフローに与える影響を調べたりするときに使います。

- `migrationOrder` はデータ依存に沿った移植順序、`testScaffold` は各処理のテストに用意する入力型を示します。scaffold は準備用のひな形で、データの具体的な値は自分で用意します。
- `generateInvariantAssertions` は、各状態で必要なデータを文字列で列挙し、テストの検査項目を書く材料にします。
- `crossFlowMap` は、あるフローの出力を別のフローが必要としている関係を調べます。データの転送を実行する API ではありません。
- `diff` は定義変更前後のデータフローの差分を調べます。`versionCompatibility` は、新しい定義が期待するデータを古い実行中インスタンスが持っていない可能性を調べます。

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

**いつ使うか:** データ依存の分析結果を文書に載せたり、別のツールで利用したりするときに使います。

`toMermaid` はテキストから図を描く Mermaid 形式、`toJson` はツールで読み込める JSON、`toMarkdown` は読みやすいチェックリストを出力します。Java の `renderDataFlow` には、グラフを独自の図形式へ変換する関数（レンダラー）を渡します。

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

**いつ使うか:** フローがどこまで進んだか、入力がなぜ拒否されたか、どこで失敗したかを後から調べるときに使います。エンジンがイベント発生時に呼ぶ関数（コールバック）を登録し、既存のログや監視先へ記録します。

- `setTransitionLogger` は、実行が通った状態遷移を記録するときに使います。
- `setGuardLogger` は、外部入力の受け入れ・拒否を調べるときに使います。
- `setStateLogger` は、コンテキストへのデータ追加を追跡するときに使います。
- `setErrorLogger` は、失敗を監視先へ通知するときに使います。
- `removeAllLoggers` は、テストなどで登録済みのロガーをすべて解除するときに使います。

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

**いつ使うか:** CSV の取り込みのように、外部入力を待たず同じ順序で処理を実行するときに使います。状態を列挙する代わりにステップを並べ、`build()` でデータ依存を検証します。

- 定義と実行: `step` で実行順を指定し、`execute` に初期データを渡します。
- エラー調査: `PipelineException` から失敗したステップと完了済みのステップを確認します。Java/TypeScript は途中結果のコンテキストも取得でき、Rust のエラーにはステップ名と元のエラーが含まれます。
- 出力の整理: `dataFlow().deadData()` で後続ステップが使わない出力を探します。呼び出し元が最終結果として使っている値は除いて判断します。
- 再利用: `asStep()` で既存の Pipeline を別の Pipeline の1ステップに組み込みます。Rust での組み合わせ方はコード中の注記を参照してください。
- 出力の実行時検証: strictMode（厳格モード）は、各ステップの実行後に、宣言した出力が存在するかを検査します。宣言の整合性だけでは見つからない書き込み忘れの検出に使います。

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

**いつ使うか:** 手で書いた図が実装とずれるのを防ぎたいときや、別言語へ移植する実装のひな形が必要なときに使います。フロー定義から生成し、Processor の業務処理は自分で実装します。

- `MermaidGenerator.generate` は、許可された状態遷移を図にします。
- `generateDataFlow` は、どの処理がデータを作り、どの処理が使うかを図にします。
- `generateExternalContract` は、外部入力を受け取る境界の契約、つまり Guard が必要とするデータと検証後に用意するデータを図にします。
- `SkeletonGenerator.generate` は、別言語で実装を始めるための Processor のスケルトン（ひな形）を作ります。
- `renderStateDiagram` は、Java で状態遷移を独自の図形式に変換するときに使います。

Mermaid はテキストで図を記述する形式です。Rust の `MermaidView` は、状態遷移図とデータフロー図のどちらを出力するかを明示します。

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

**いつ使うか:** 再試行で回復しうる失敗と、処理を終えるべき失敗を区別するときに使います。`RETRYABLE` は再試行可能、`FATAL` は回復不能という分類で、Rust では同じ enum の代わりにエラーコード文字列と条件判定で遷移先を選びます。

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
