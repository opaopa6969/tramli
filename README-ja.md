[English version](README.md)

# tramli

制約付きフローエンジン — **Java, TypeScript, Rust。**

**不正な遷移が構造的に存在できない**ステートマシン — コンパイラと [8項目検証](#8項目-build-検証) がビルド時に保証。

> **tramli** = tramline（路面電車の軌道）。コードはレールの上を走る — 敷かれた軌道以外には行けない。

**読む**: [なぜ tramli は効くのか — アテンション・バジェット](docs/why-tramli-works-attention-budget-ja.md) | [English](docs/why-tramli-works.md)
**実践例**: [OIDC 認証フロー（9 ステート、5 プロセッサ）](docs/example-oidc-auth-flow-ja.md) | [English](docs/example-oidc-auth-flow.md)
**クックブック**: [API クックブック — 全メソッドの使用例](docs/api-cookbook-ja.md) | [English](docs/api-cookbook.md)

---

## 目次

- [なぜ tramli が必要か](#なぜ-tramli-が必要か)
- [クイックスタート](#クイックスタート) — 状態定義、Processor、フロー、実行
- [コアコンセプト](#コアコンセプト) — 8つの構成要素
  - [FlowState](#flowstate) — システムが取りうる状態
  - [StateProcessor](#stateprocessor) — 1遷移分のビジネスロジック
  - [TransitionGuard](#transitionguard) — 外部イベントの検証（純粋関数）
  - [BranchProcessor](#branchprocessor) — 条件分岐
  - [FlowContext](#flowcontext) — 型安全なデータアキュムレータ
  - [FlowDefinition](#flowdefinition) — フロー全体の宣言的な地図
  - [FlowEngine](#flowengine) — ロジックゼロのオーケストレータ
  - [FlowStore](#flowstore) — 差し替え可能な永続化
- [3種類の遷移](#3種類の遷移) — Auto, External, Branch
- [Auto-Chain（自動連鎖）](#auto-chain自動連鎖) — 1リクエストで複数遷移が発火する仕組み
- [8項目 build() 検証](#8項目-build-検証) — `build()` が何をチェックするか
- [requires / produces 契約](#requires--produces-契約) — Processor 間のデータフロー
- [Mermaid 図の自動生成](#mermaid-図の自動生成) — コード = 図、常に最新
- [データフローグラフ](#データフローグラフ) — 自動データ依存分析
- [Pipeline](#pipeline) — build 時検証付き直列パイプライン
- [ロギング](#ロギング) — ゼロ依存プラガブルロガー
- [エラーハンドリング](#エラーハンドリング) — Guard 拒否、リトライ上限、例外型ルーティング
- [なぜ LLM と相性が良いか](#なぜ-llm-と相性が良いか)
- [パフォーマンス](#パフォーマンス)
- [ユースケース](#ユースケース)
- [用語集](#用語集)

---

## なぜ tramli が必要か

```
1800行の手続き的ハンドラ → 「callback 処理はどこから始まる？」
  → 全部読む → コンテキスト窓が溢れる → ミスが起きる

tramli の FlowDefinition (50行) → 「これを読んで、対象の Processor を1個読む」
  → 合計100行で完了 → コンパイラが残りを守る
```

核心的な洞察: **「何を読まなくていいか」が「何を読むか」より重要。**

手続き的ハンドラでは、全ての行が暗黙のコンテキスト。400行目を変えると1200行目が壊れるかもしれない。全部読まないとわからない。

tramli では [StateProcessor](#stateprocessor) が閉じた単位。[requires()](#requires--produces-契約) が入力を宣言し、[produces()](#requires--produces-契約) が出力を宣言する。1つの Processor を変えても他には影響しない。

これは**人間**（限られたワーキングメモリ）にも **LLM**（限られたコンテキスト窓）にも等しく効く。

---

## クイックスタート

### 1. [状態](#flowstate)を定義する

```java
enum OrderState implements FlowState {
    CREATED(false, true),           // 初期状態
    PAYMENT_PENDING(false, false),
    PAYMENT_CONFIRMED(false, false),
    SHIPPED(true, false),           // 終端 — フローはここで終わる
    CANCELLED(true, false);         // 終端 — エラー終了

    private final boolean terminal, initial;
    OrderState(boolean t, boolean i) { terminal = t; initial = i; }
    @Override public boolean isTerminal() { return terminal; }
    @Override public boolean isInitial() { return initial; }
}
```

なぜ `enum` か？ コンパイラが網羅性を保証するから。`"COMLETE"` のようなタイポはあり得ない — コンパイルエラーになる。

### 2. [Processor](#stateprocessor) を書く（1遷移 = 1 Processor）

```java
StateProcessor orderInit = new StateProcessor() {
    @Override public String name() { return "OrderInit"; }
    @Override public Set<Class<?>> requires() { return Set.of(OrderRequest.class); }
    @Override public Set<Class<?>> produces() { return Set.of(PaymentIntent.class); }
    @Override public void process(FlowContext ctx) {
        OrderRequest req = ctx.get(OrderRequest.class);  // 型安全、キャスト不要
        ctx.put(PaymentIntent.class, new PaymentIntent("txn-" + req.itemId()));
    }
};
```

`requires()` と `produces()` は単なるドキュメントではない — フロー内の全パスに対して **[build() 時に検証](#8項目-build-検証)** される。

### 3. [フロー](#flowdefinition)を定義する

```java
var orderFlow = Tramli.define("order", OrderState.class)
    .ttl(Duration.ofHours(24))
    .initiallyAvailable(OrderRequest.class)      // startFlow() で提供
    .from(CREATED).auto(PAYMENT_PENDING, orderInit)
    .from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
    .from(CONFIRMED).auto(SHIPPED, shipProcessor)
    .onAnyError(CANCELLED)
    .build();  // ← ここで8項目検証
```

上から下に読めば — これ**がフロー**。構造を理解するのに他のファイルは不要。

### 4. 実行する

```java
var engine = Tramli.engine(new InMemoryFlowStore());

// 開始: CREATED → 自動連鎖 → PAYMENT_PENDING（停止、外部イベント待ち）
var flow = engine.startFlow(orderFlow, null,
    Map.of(OrderRequest.class, new OrderRequest("item-1", 3)));

// 外部イベント到着（例: 決済 Webhook）
flow = engine.resumeAndExecute(flow.id(), orderFlow);
// → Guard 検証 → CONFIRMED → 自動連鎖 → SHIPPED（終端、完了）
```

### 5. [Mermaid 図](#mermaid-図の自動生成)を生成する

```java
String mermaid = MermaidGenerator.generate(orderFlow);
```

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> PAYMENT_PENDING : OrderInit
    PAYMENT_PENDING --> PAYMENT_CONFIRMED : [PaymentGuard]
    PAYMENT_CONFIRMED --> SHIPPED : ShipProcessor
    SHIPPED --> [*]
    CANCELLED --> [*]
```

この図は**コードから生成される** — 古くなることがない。

---

## コアコンセプト

tramli には8つの構成要素がある。それぞれ小さく、焦点が絞られ、単独でテスト可能。

### FlowState

全ての取りうる状態を定義する `enum`。各状態は自分が[終端](#終端状態)（フローがここで終わる）か[初期](#初期状態)（フローがここから始まる）かを知っている。

```java
public interface FlowState {
    String name();
    boolean isTerminal();
    boolean isInitial();
}
```

**なぜ enum か？** コンパイラが網羅性を保証する。状態に対する `switch` → コンパイラが欠落ケースを警告する。LLM は存在しない状態を hallucinate できない。

### StateProcessor

1つの遷移の**ビジネスロジック**。最も重要な原則: **1遷移 = 1 Processor。**

```java
public interface StateProcessor {
    String name();
    Set<Class<?>> requires();   // FlowContext から必要なもの
    Set<Class<?>> produces();   // FlowContext に追加するもの
    void process(FlowContext ctx) throws FlowException;
}
```

これが意味すること:
- Processor A を変えても Processor B は壊れない
- テストは簡単: [FlowContext](#flowcontext) をモック、`process()` を呼ぶ、出力を確認
- LLM はこのステップを修正するのに**このファイル1個だけ**読めばいい

### TransitionGuard

[External 遷移](#external-遷移)を検証する。**純粋関数** — [FlowContext](#flowcontext) を変更してはいけない。

```java
public interface TransitionGuard {
    String name();
    Set<Class<?>> requires();
    Set<Class<?>> produces();
    int maxRetries();
    GuardOutput validate(FlowContext ctx);

    sealed interface GuardOutput {
        record Accepted(Map<Class<?>, Object> data) implements GuardOutput {}
        record Rejected(String reason) implements GuardOutput {}
        record Expired() implements GuardOutput {}
    }
}
```

`sealed interface` は [FlowEngine](#flowengine) が正確に3ケースを処理することを意味する — コンパイラが `switch` でこれを強制する。忘れられたエッジケースはない。

**Accepted** → データが context にマージされ、遷移が進む。
**Rejected** → 失敗カウンタが増加。[maxRetries](#エラーハンドリング) 後 → [エラー遷移](#エラーハンドリング)。
**Expired** → フローが `EXPIRED` 終了状態で完了。

### BranchProcessor

分岐点でどのパスを取るか選択する。[FlowDefinition](#flowdefinition) 内のターゲット状態にマッピングされる**ラベル**（文字列）を返す。

```java
public interface BranchProcessor {
    String name();
    Set<Class<?>> requires();
    String decide(FlowContext ctx);  // 分岐ラベルを返す
}
```

例: ユーザー解決後に MFA が必要か判定する:

```java
// FlowDefinition:
.from(USER_RESOLVED).branch(mfaCheck)
    .to(COMPLETE, "no_mfa", sessionProcessor)
    .to(MFA_PENDING, "mfa_required", sessionProcessor)
    .endBranch()

// BranchProcessor:
@Override public String decide(FlowContext ctx) {
    return ctx.get(ResolvedUser.class).mfaRequired() ? "mfa_required" : "no_mfa";
}
```

### FlowContext

型安全なデータバケツ。`Class<?>` をキーにする — 各型は最大1回だけ出現する。

```java
ctx.put(PaymentResult.class, new PaymentResult("OK"));  // 書き込み
PaymentResult r = ctx.get(PaymentResult.class);          // 読み取り（型安全）
Optional<PaymentResult> o = ctx.find(PaymentResult.class); // 任意の読み取り
```

**なぜ Class キーか？** 3つの理由:
1. **タイポ不可能** — `ctx.get(PaymentResult.class)` はスペルミスできない（`map.get("payment_result")` とは違う）
2. **キャスト不要** — 戻り値型が推論される
3. **検証可能** — [requires/produces](#requires--produces-契約) 宣言が同じクラスを使うので [ビルド時検証](#8項目-build-検証) が可能

**パススルー問題なし:** 全 Processor の出力が context に蓄積される。Processor C は B を経由せずに A が生成したデータを読める。

### FlowDefinition

フロー構造の**唯一の情報源**。DSL で構築され `build()` で検証される宣言的な[遷移テーブル](#遷移テーブル)。

```java
var flow = Tramli.define("order", OrderState.class)
    .ttl(Duration.ofHours(24))
    .maxGuardRetries(3)
    .initiallyAvailable(OrderRequest.class)
    .from(CREATED).auto(PAYMENT_PENDING, orderInit)
    .from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
    .from(CONFIRMED).branch(stockCheck)
        .to(SHIPPED, "in_stock", shipProcessor)
        .to(CANCELLED, "out_of_stock", cancelProcessor)
        .endBranch()
    .onAnyError(CANCELLED)
    .build();
```

これを読むのは地図を読むようなもの — 15行で旅の全体が見える。LLM と人間が tramli で効率的に作業できる理由: **地図がコードそのもの。**

### FlowEngine

約120行。**ビジネスロジックゼロ。** やることは正確に3つ:

1. `startFlow()` — context を初期化、[自動連鎖](#auto-chain自動連鎖)を実行
2. `resumeAndExecute()` — 外部データをマージ、[Guard](#transitionguard) を検証、[自動連鎖](#auto-chain自動連鎖)を実行
3. `executeAutoChain()` — [Auto](#auto-遷移)/[Branch](#branch-遷移) 遷移を [External](#external-遷移) か[終端](#終端状態)まで発火

フローを追加してもエンジンは変わらない。エンジンはレール — [Processor](#stateprocessor) が貨物。

### FlowStore

差し替え可能な永続化インターフェース。実装するのは4メソッド:

```java
public interface FlowStore {
    void create(FlowInstance<?> flow);
    <S extends Enum<S> & FlowState> Optional<FlowInstance<S>> loadForUpdate(String flowId, FlowDefinition<S> def);
    void save(FlowInstance<?> flow);
    void recordTransition(String flowId, FlowState from, FlowState to, String trigger, FlowContext ctx);
}
```

| 実装 | 用途 |
|------|------|
| `InMemoryFlowStore` | テスト、シングルプロセスアプリ。tramli に同梱。 |
| JDBC（自前実装） | PostgreSQL/MySQL の JSONB context、`SELECT FOR UPDATE` ロッキング |
| Redis（自前実装） | TTL ベースの有効期限付き分散フロー |

---

## 3種類の遷移

[フロー図](#mermaid-図の自動生成)の全ての矢印は3種類のいずれか:

| 種類 | トリガー | エンジンが発火するタイミング | 例 |
|------|---------|--------------------------|-----|
| [**Auto**](#auto-遷移) | 前の遷移が完了 | 即座、待機なし | `CONFIRMED → SHIPPED` |
| [**External**](#external-遷移) | 外部イベント（HTTP, メッセージ） | `resumeAndExecute()` 時のみ | `PENDING → CONFIRMED` |
| [**Branch**](#branch-遷移) | [BranchProcessor](#branchprocessor) がラベルを返す | 即座、Auto と同様 | `RESOLVED → COMPLETE or MFA_PENDING` |

---

## Auto-Chain（自動連鎖）

[External](#external-遷移) 遷移の [Guard](#transitionguard) が通過すると、エンジンは止まらない — 別の External か[終端状態](#終端状態)にぶつかるまで [Auto](#auto-遷移) と [Branch](#branch-遷移) 遷移を発火し続ける。

```
HTTPリクエスト到着（callback）
  → External: REDIRECTED → CALLBACK_RECEIVED     ← Guard 検証
  → Auto:     CALLBACK_RECEIVED → TOKEN_EXCHANGED ← Processor 実行
  → Auto:     TOKEN_EXCHANGED → USER_RESOLVED     ← Processor 実行
  → Branch:   USER_RESOLVED → COMPLETE            ← Branch 判定
  （終端 — フロー完了）
```

**1つの HTTP リクエストで4つの遷移。** エンジンが連鎖を処理する — 各 [Processor](#stateprocessor) は自分のステップだけを知っている。

安全装置: 自動連鎖の最大深度は10。[build() 時の DAG 検証](#8項目-build-検証)により Auto/Branch 遷移がサイクルを形成しないことが保証される。

---

## 8項目 build() 検証

`build()` は8つの構造チェックを実行する。いずれかが失敗すると明確なエラーメッセージが出る — **フローが実行される前に。**

| # | チェック | 何を防ぐか |
|---|---------|-----------|
| 1 | 全ての非終端状態が[初期](#初期状態)から[到達可能](#到達可能) | 決して入れない死に状態 |
| 2 | 初期から[終端](#終端状態)へのパスが存在 | 完了できないフロー |
| 3 | [Auto](#auto-遷移)/[Branch](#branch-遷移) 遷移が [DAG](#dag) を形成 | 無限自動連鎖ループ |
| 4 | 各状態に [External](#external-遷移) は最大1つ | 「どのイベントを待っているか」が曖昧 |
| 5 | 全ての [Branch](#branch-遷移) ターゲットが定義済み | `decide()` がターゲット状態のないラベルを返す |
| 6 | [requires/produces](#requires--produces-契約) チェーンの整合性 | 実行時の「データがない」エラー |
| 7 | [終端](#終端状態)状態からの遷移がない | 最終であるべき状態がそうなっていない |
| 8 | [初期状態](#初期状態)が存在 | 状態に initial マークを付け忘れ |

**LLM が tramli コードを安全に生成できる理由** — 生成した遷移が間違っていても `build()` が即座に拒否する。フィードバックループ: 生成 → コンパイル → build() → 修正。実行時サプライズなし。

---

## requires / produces 契約

全ての [StateProcessor](#stateprocessor) と [TransitionGuard](#transitionguard) は必要なデータと提供するデータを宣言する:

```java
@Override public Set<Class<?>> requires() { return Set.of(OrderRequest.class); }
@Override public Set<Class<?>> produces() { return Set.of(PaymentIntent.class); }
```

[build() 時](#8項目-build-検証)に、tramli はフロー内の全パスを走査して、各 Processor の `requires()` が前段の Processor の `produces()`（または [initiallyAvailable](#initially-available-初期データ) データ）で満たされることを検証する。

```
パス: CREATED → PAYMENT_PENDING → CONFIRMED → SHIPPED

CREATED での利用可能データ:    {OrderRequest}         ← initiallyAvailable
OrderInit 後:               {OrderRequest, PaymentIntent}  ← produces
Guard が PaymentIntent を要求: ✓ 利用可能
PaymentGuard 後:            {... + PaymentResult}
ShipProcessor が PaymentResult を要求: ✓ 利用可能
```

`CustomerProfile` を requires するが何も produces しない Processor を追加すると、`build()` が失敗する:

```
Flow 'order' has 1 validation error(s):
  - Processor 'ShipProcessor' at CONFIRMED → SHIPPED requires CustomerProfile
    but it may not be available
```

---

## Mermaid 図の自動生成

```java
String mermaid = MermaidGenerator.generate(definition);
MermaidGenerator.writeToFile(definition, Path.of("docs/diagrams"));
```

図は **[FlowDefinition](#flowdefinition) から生成される** — [エンジン](#flowengine)が使うのと同じオブジェクト。古くなることがない。

CI 連携: 生成 → コミット済み `.mmd` ファイルと比較 → 差分があればテスト失敗。開発者にフロー変更時の図の更新を強制する。

---

## データフローグラフ

`build()` のたびに **DataFlowGraph** が自動構築される — requires/produces 宣言から導出された二部グラフ。`def.dataFlowGraph()` で取得。

### Dual View: 状態遷移 + データフロー

状態遷移図は**制御の流れ**（何が起きるか）、データフロー図は**データの流れ**（何が流れるか）を示す:

```java
// 状態遷移図（既存）
String states = MermaidGenerator.generate(orderFlow);

// データフロー図（新規）
String dataFlow = MermaidGenerator.generateDataFlow(orderFlow);
```

### クエリ API

```java
DataFlowGraph<OrderState> graph = orderFlow.dataFlowGraph();

// PAYMENT_PENDING に到達したとき、どのデータが利用可能？
Set<Class<?>> available = graph.availableAt(PAYMENT_PENDING);

// PaymentIntent を produces するのは誰？
List<NodeInfo> producers = graph.producersOf(PaymentIntent.class);

// OrderRequest を requires するのは誰？
List<NodeInfo> consumers = graph.consumersOf(OrderRequest.class);

// Dead data: produces されたが下流で requires されない型
Set<Class<?>> dead = graph.deadData();
```

### 分析 API

```java
// データのライフサイクル
var lt = graph.lifetime(PaymentIntent.class);

// Context 枝刈りヒント
Map<OrderState, Set<Class<?>>> hints = graph.pruningHints();

// 型変更の影響分析
var impact = graph.impactOf(PaymentIntent.class);

// テストに必要な最小データ
Map<String, List<String>> scaffold = graph.testScaffold();

// カスタムレンダリング（Graphviz, PlantUML 等）
graph.renderDataFlow(myDotRenderer);
```

### なぜ重要か

| DataFlowGraph なし | DataFlowGraph あり |
|-------------------|-------------------|
| 「状態 X でどのデータが使える？」→ 全 processor コードを読む | `graph.availableAt(X)` |
| 「PaymentIntent を変えたら何が壊れる？」→ grep | `graph.consumersOf(PaymentIntent.class)` |
| 「未使用データが溜まってない？」→ 手動レビュー | `graph.deadData()` |
| 「新メンバーにデータパイプラインを説明」→ 会議 | Mermaid 図を見せる |

Airflow/Temporal ユーザーが欲しがる機能: **ビルド時の静的データフロー解析**。あちらは動的 XCom/payload で静的保証がない。tramli の `requires/produces` 宣言があるからこそ、実行前に検証できる。

### 全 API リファレンス

#### DataFlowGraph

| メソッド | 戻り値 | 説明 |
|---------|--------|------|
| `availableAt(state)` | `Set<Class<?>>` | 指定状態で context に利用可能な型 |
| `producersOf(type)` | `List<NodeInfo>` | この型を produces する processor/guard |
| `consumersOf(type)` | `List<NodeInfo>` | この型を requires する processor/guard |
| `deadData()` | `Set<Class<?>>` | produces されたが requires されない型 |
| `lifetime(type)` | `Lifetime(firstProduced, lastConsumed)` | データのライフサイクル |
| `pruningHints()` | `Map<S, Set<Class<?>>>` | 各状態で不要になった型 |
| `impactOf(type)` | `Impact(producers, consumers)` | 型変更の影響を受けるノード |
| `parallelismHints()` | `List<String[]>` | データ依存のない独立 processor ペア |
| `assertDataFlow(ctx, state)` | `List<Class<?>>` | 不変条件の欠落型（空 = OK） |
| `verifyProcessor(proc, ctx)` | `List<String>` | 実行時の requires/produces 違反 |
| `isCompatible(a, b)` | `boolean` | processor B が A を置換可能か |
| `migrationOrder()` | `List<String>` | 依存順ソートの移植推奨順序 |
| `testScaffold()` | `Map<String, List<String>>` | processor ごとのテスト用最小データ |
| `generateInvariantAssertions()` | `List<String>` | 各状態のデータフロー不変条件文字列 |
| `crossFlowMap(graphs...)` | `List<String>` | フロー間のデータ依存 |
| `diff(before, after)` | `DiffResult` | 2 つのグラフの差分 |
| `versionCompatibility(v1, v2)` | `List<String>` | 定義バージョン間の非互換 |
| `toMermaid()` | `String` | Mermaid flowchart LR 図 |
| `toJson()` | `String` | 構造化 JSON |
| `toMarkdown()` | `String` | 移植チェックリスト（Markdown） |
| `toRenderable()` | `RenderableGraph.DataFlow` | カスタムレンダラー用 read-only ビュー |
| `renderDataFlow(fn)` | `String` | カスタム関数でレンダリング（dot, PlantUML 等） |

#### FlowDefinition

| メソッド | 説明 |
|---------|------|
| `build()` | 検証 + 構築（8 項目 + データフロー検証） |
| `dataFlowGraph()` | 導出された DataFlowGraph を取得 |
| `warnings()` | 構造的警告（liveness リスク等） |
| `withPlugin(from, to, pluginFlow)` | 遷移の前にサブフローを挿入（新定義を返す） |

#### FlowInstance

| メソッド | 説明 |
|---------|------|
| `currentState()` | 現在の状態 |
| `isCompleted()` | terminal に到達したか |
| `exitState()` | terminal 状態名（active なら null） |
| `context()` | 全データが入った FlowContext |
| `lastError()` | 最後の processor 失敗のエラーメッセージ |
| `activeSubFlow()` | アクティブなサブフロー（なければ null） |
| `statePath()` | ルートからの状態パス: `["PAYMENT", "CONFIRM"]` |
| `statePathString()` | スラッシュ区切り: `"PAYMENT/CONFIRM"` |
| `waitingFor()` | 現在の External 遷移が必要とする型 |
| `availableData()` | 現在の状態で利用可能な型（DataFlowGraph より） |
| `missingFor()` | 次の遷移に不足している型 |
| `withVersion(n)` | バージョン更新コピー（FlowStore の楽観ロック用） |

#### FlowContext

| メソッド | 説明 |
|---------|------|
| `get(key)` | 型付き値取得（なければ例外） |
| `find(key)` | 型付き値取得（Optional / undefined） |
| `put(key, value)` | 型付き値を保存 |
| `has(key)` | キーの存在確認 |
| `registerAlias(type, alias)` | 言語横断シリアライズ用のエイリアス登録 |
| `toAliasMap()` | エイリアス → 値のマップにエクスポート |
| `fromAliasMap(map)` | エイリアスマップからインポート |

#### FlowEngine

| メソッド | 説明 |
|---------|------|
| `startFlow(def, session, data)` | 新しいフローインスタンスを開始 |
| `resumeAndExecute(flowId, def)` | External 遷移で再開。`flowNotFound` / `flowAlreadyCompleted` / `flowExpired` を投げる |
| `setTransitionLogger(fn)` | 遷移ごとのログ（entry に `flowName` 含む） |
| `setGuardLogger(fn)` | Guard の Accepted/Rejected/Expired をログ |
| `setStateLogger(fn)` | context.put() ごとのログ（オプト・イン） |
| `setErrorLogger(fn)` | エラー遷移のログ |
| `removeAllLoggers()` | 全ロガー解除 |

#### Builder DSL

| メソッド | 説明 |
|---------|------|
| `.from(state).auto(to, processor)` | Auto 遷移 |
| `.from(state).external(to, guard)` | External 遷移（イベント待ち） |
| `.from(state).branch(branch).to(s, label).endBranch()` | 条件分岐 |
| `.from(state).subFlow(def).onExit("X", s).endSubFlow()` | サブフロー埋め込み |
| `.onError(from, to)` | 状態ベースのエラー遷移 |
| `.onStepError(from, ExceptionClass, to)` | 例外型ベースのエラー遷移 |
| `.onAnyError(state)` | 全状態のエラーフォールバック |
| `.initiallyAvailable(types...)` | 初期データ型の宣言 |
| `.ttl(duration)` | フローの有効期限 |
| `.maxGuardRetries(n)` | Guard 拒否の上限回数 |

#### コード生成

| クラス | メソッド | 説明 |
|-------|---------|------|
| `MermaidGenerator` | `generate(def)` | 状態遷移図 |
| `MermaidGenerator` | `generateDataFlow(def)` | データフロー図 |
| `MermaidGenerator` | `generateExternalContract(def)` | External 遷移のデータ契約図 |
| `MermaidGenerator` | `dataFlow(renderable)` | RenderableGraph を Mermaid でレンダリング |
| `MermaidGenerator` | `stateDiagram(renderable)` | RenderableStateDiagram を Mermaid でレンダリング |
| `SkeletonGenerator` | `generate(def, language)` | Java/TS/Rust の Processor スケルトン生成 |

---

## Pipeline

すべてのワークフローにステートが必要なわけではない。外部イベントや分岐のない**直列処理チェーン**には、`Tramli.pipeline()` が同じ build 時データフロー検証をよりシンプルな API で提供する。ステートなし、エンジンなし、永続化なし——ステップとデータだけ。

### 1. データ型を定義

```java
record RawInput(String csv) {}
record Parsed(List<String[]> rows) {}
record Validated(List<String[]> rows, int errorCount) {}
record Enriched(List<Map<String, String>> records) {}
record SaveResult(int savedCount) {}
```

### 2. ステップを書く（1 ステップ = 1 [PipelineStep](#pipelinestep)）

```java
PipelineStep parse = new PipelineStep() {
    @Override public String name() { return "Parse"; }
    @Override public Set<Class<?>> requires() { return Set.of(RawInput.class); }
    @Override public Set<Class<?>> produces() { return Set.of(Parsed.class); }
    @Override public void process(FlowContext ctx) {
        RawInput raw = ctx.get(RawInput.class);
        List<String[]> rows = CsvParser.parse(raw.csv());
        ctx.put(Parsed.class, new Parsed(rows));
    }
};
// validate, enrich, save も同じパターン
```

各ステップが「何を必要とし何を提供するか」を宣言。**[StateProcessor](#stateprocessor) と同じ契約**だが、ステートのジェネリクスがない。

### 3. パイプラインを定義

```java
var pipeline = Tramli.pipeline("csv-import")
    .initiallyAvailable(RawInput.class)
    .step(parse)       // requires: RawInput,   produces: Parsed
    .step(validate)    // requires: Parsed,     produces: Validated
    .step(enrich)      // requires: Validated,  produces: Enriched
    .step(save)        // requires: Enriched,   produces: SaveResult
    .build();          // ← requires/produces チェーンを build 時に検証
```

`enrich` が `Validated` を requires しているのに誰も produces していなければ、`build()` が失敗:

```
Pipeline 'csv-import' has 1 error(s):
  - Step 'Enrich' requires Validated but it may not be available
```

### 4. 実行

```java
FlowContext result = pipeline.execute(Map.of(RawInput.class, new RawInput(csvString)));
SaveResult saved = result.get(SaveResult.class);
System.out.println("Saved " + saved.savedCount() + " records");
```

全ステップが順に実行。ステップが例外を投げると `PipelineException` で全体像が分かる:

```java
try {
    pipeline.execute(data);
} catch (PipelineException e) {
    e.completedSteps();  // ["Parse", "Validate"]     ← 成功
    e.failedStep();      // "Enrich"                   ← ここで失敗
    e.context();         // Parsed + Validated が入った FlowContext
    e.cause();           // 元の例外
}
```

### 5. 図を生成

```java
String mermaid = pipeline.dataFlow().toMermaid();
```

```mermaid
flowchart LR
    RawInput -->|requires| Parse
    Parse -->|produces| Parsed
    Parsed -->|requires| Validate
    Validate -->|produces| Validated
    Validated -->|requires| Enrich
    Enrich -->|produces| Enriched
    Enriched -->|requires| Save
    Save -->|produces| SaveResult
```

### その他の機能

```java
// Dead data 検出
pipeline.dataFlow().deadData();  // produces されたが requires されない型

// パイプラインのネスト
PipelineStep sub = otherPipeline.asStep();

// strictMode: produces を実行時に検証
pipeline.setStrictMode(true);

// カスタムレンダリング（Graphviz, PlantUML 等）
pipeline.dataFlow().renderDataFlow(myDotRenderer);

// ログフック（FlowEngine と同じ）
pipeline.setTransitionLogger(entry -> log.info("{} → {}", entry.from(), entry.to()));
```

### 使い分け

| シナリオ | ツール |
|---------|--------|
| 直列 2-4 ステップ、型 1 つずつ | 関数合成 / pipe |
| 直列 5+ ステップ、データ蓄積 | **`Tramli.pipeline()`** |
| 分岐 / 外部イベント / 永続化 | **`Tramli.define()`**（[FlowDefinition](#flowdefinition)） |
| 分散 / 長時間 / スケジュール | Airflow / Temporal |

Pipeline は tramli の**入口**。`pipeline()` で始めて、分岐や外部イベントが必要になったら `define()` にアップグレード。ステップのインターフェースは同じ——プロセッサを書き直す必要はない。

---

## エラーハンドリング

### Guard 拒否

[Guard](#transitionguard) が `Rejected` を返すと、[エンジン](#flowengine)は失敗カウンタを増加させる。`maxRetries` 回の拒否後、フローはエラー状態に遷移する:

```java
.maxGuardRetries(3)            // 定義レベルのデフォルト
.onAnyError(CANCELLED)         // 全非終端状態 → CANCELLED（エラー時）
.onError(CHECKOUT, RETRY)      // 特定状態の上書き
```

### エラー遷移

`onAnyError(S)` は全ての非[終端](#終端状態)状態をエラーターゲットにマッピングする。`onError(from, to)` で特定状態を上書き。エラーターゲットは[到達可能性チェック](#8項目-build-検証)に含まれる。

### 例外型ベースのエラールーティング

異なる例外を異なるエラー状態にルーティングできる。`onStepError` で細かく制御:

```java
.from(TOKEN_EXCHANGE).auto(USER_RESOLVED, tokenExchange)
.onStepError(TOKEN_EXCHANGE, HttpTimeoutException.class, RETRIABLE_ERROR)  // タイムアウト → リトライ
.onStepError(TOKEN_EXCHANGE, InvalidTokenException.class, TERMINAL_ERROR)  // 不正トークン → 致命的
.onAnyError(GENERAL_ERROR)  // マッチしなかった例外のフォールバック
```

マッチング順:
1. `onStepError` — 最初にマッチした `instanceof` が勝つ
2. `onError` — 状態ベースのフォールバック
3. `onAnyError` — キャッチオール
4. マッチなし — `TERMINAL_ERROR` exit

I/O が多い processor で **400 エラー（クライアント起因）と 500 エラー（サーバー起因）で処理を分けたい** ときに有用。

### TTL 期限切れ

全フローに TTL がある（`.ttl()` で設定）。期限後に `resumeAndExecute()` が呼ばれると、フローは終了状態 `"EXPIRED"` で完了する。遷移は発火しない — フローは単に終わる。

---

## ロギング

tramli は**ロギング依存ゼロ**。ラムダ/コールバックで自分のロガーを差し込む:

```java
var engine = Tramli.engine(store);

// 遷移ログ — 全遷移で呼ばれる
engine.setTransitionLogger(entry ->
    log.info("{} → {} ({})", entry.from(), entry.to(), entry.trigger()));

// エラーログ — エラー遷移で呼ばれる
engine.setErrorLogger(entry ->
    log.error("error at {}: {}", entry.from(), entry.cause().getMessage()));

// 状態ログ（オプト・イン）— context.put() ごとに呼ばれる。デバッグ用
engine.setStateLogger(entry ->
    log.debug("put {} = {} (type: {})", entry.typeName(), entry.value(), entry.type()));

// 全ロガー解除
engine.removeAllLoggers();
```

ログエントリは **record**（Java）/ **interface**（TS）/ **struct**（Rust）。型安全: `StateLogEntry.type()` で `Class<?>` にアクセス、`typeName()` でシンプル名の文字列。

---

## なぜ LLM と相性が良いか

| 手続き的コードの問題 | tramli の解決策 |
|-------------------|----------------|
| 「callback ハンドラを見つけるのに1800行読む」 | [FlowDefinition](#flowdefinition) を読む（50行） |
| 「この時点でどのデータが利用可能？」 | [requires()](#requires--produces-契約) を確認 |
| 「変更が他を壊すか？」 | [1 Processor = 1つの閉じた単位](#stateprocessor) |
| 「間違った状態名を生成した」 | `enum` → コンパイルエラー |
| 「エッジケースの処理を忘れた」 | `sealed interface` [GuardOutput](#transitionguard) → コンパイラが警告 |
| 「フロー図が古い」 | [コードから生成](#mermaid-図の自動生成) |
| 「無限ループする遷移を追加した」 | ビルド時の [DAG チェック](#8項目-build-検証) |

**核心原理: LLM は hallucinate するが、コンパイラと `build()` は嘘をつかない。**

---

## パフォーマンス

tramli のオーバーヘッドは I/O バウンドなアプリケーションでは無視できる:

```
1遷移あたり:   ~300-500ns (enum 比較 + HashMap lookup)
5遷移フロー:   ~2μs 合計

比較:
  DB INSERT:         1-5ms
  HTTP 往復:         50-500ms
  IdP OAuth 交換:    200-500ms

SM オーバーヘッド / 全体 = 0.0004%
```

| アプリケーション種別 | 適用可能？ |
|-------------------|----------|
| Web API、認証フロー (10ms+) | Yes |
| 決済、注文処理 | Yes |
| バッチジョブオーケストレーション | Yes |
| リアルタイムメッセージング (1-5ms) | Yes ([InMemoryFlowStore](#flowstore) で) |
| HFT、ゲームループ (マイクロ秒) | No |

---

## ユースケース

tramli は**状態、遷移、外部イベント**があるシステムなら何でも使える:

- **認証** — OIDC, Passkey, MFA, 招待フロー
- **決済** — 注文 → 決済 → 履行 → 配達
- **承認** — 申請 → レビュー → 承認/却下 → 実行
- **オンボーディング** — 登録 → メール確認 → プロフィール → 完了
- **CI/CD** — ビルド → テスト → デプロイ → 検証
- **サポートチケット** — 起票 → 割当 → 対応中 → 解決 → クローズ

---

## 用語集

本ドキュメント全体でリンクされている。クリックでここにジャンプ。

| 用語 | 定義 |
|------|------|
| <a id="auto-遷移"></a>**Auto 遷移** | 前のステップが完了すると即座に発火する[遷移](#遷移テーブル)。外部イベント不要。エンジンが[自動連鎖](#auto-chain自動連鎖)の一部として実行。 |
| <a id="auto-chain-自動連鎖"></a>**Auto-chain（自動連鎖）** | 連続する [Auto](#auto-遷移) と [Branch](#branch-遷移) 遷移を [External](#external-遷移) 遷移か[終端状態](#終端状態)に達するまで実行するエンジンの動作。 |
| <a id="branch-遷移"></a>**Branch 遷移** | [BranchProcessor](#branchprocessor) がラベルを返してターゲット状態を決定する[遷移](#遷移テーブル)。[Auto](#auto-遷移) と同様に即座に発火。 |
| <a id="dag"></a>**DAG** | 有向非巡回グラフ。[Auto](#auto-遷移)/[Branch](#branch-遷移) 遷移は DAG を形成しなければならない — サイクル不可。[build()](#8項目-build-検証) で検証。 |
| <a id="external-遷移"></a>**External 遷移** | 外部イベント（HTTPリクエスト、Webhook、メッセージ）によってトリガーされる[遷移](#遷移テーブル)。[TransitionGuard](#transitionguard) が必要。エンジンは[自動連鎖](#auto-chain自動連鎖)を停止して待機。 |
| <a id="flowdefinition-定義"></a>**FlowDefinition** | 1つのフローの全状態、遷移、Processor、Guard の不変で検証済みの記述。DSL で構築、[build()](#8項目-build-検証) で検証。フローの「地図」。 |
| <a id="flowinstance-インスタンス"></a>**FlowInstance** | [FlowDefinition](#flowdefinition-定義) の1回の実行。ID、現在の状態、[context](#flowcontext)、TTL、完了状態を持つ。 |
| <a id="guardoutput"></a>**GuardOutput** | [TransitionGuard](#transitionguard) が返す `sealed interface`。正確に3つのバリアント: `Accepted`（進行）、`Rejected`（リトライまたはエラー）、`Expired`（TTL 超過）。 |
| <a id="初期状態"></a>**初期状態 (Initial state)** | フローが開始する状態。enum 内の正確に1つの状態が `isInitial() = true` を返さなければならない。 |
| <a id="initially-available-初期データ"></a>**initiallyAvailable（初期データ）** | フロー開始時に利用可能と宣言されたデータ型。`startFlow(initialData)` で提供。[requires/produces](#requires--produces-契約) 検証で使用。 |
| <a id="到達可能"></a>**到達可能 (Reachable)** | [初期状態](#初期状態)からなんらかの遷移列で到達できる状態。到達不能な非終端状態は [build()](#8項目-build-検証) 失敗の原因。 |
| <a id="終端状態"></a>**終端状態 (Terminal state)** | フローが終わる状態。出力遷移は許可されない。例: `COMPLETE`, `CANCELLED`, `ERROR`。 |
| <a id="遷移テーブル"></a>**遷移テーブル (Transition table)** | [FlowDefinition](#flowdefinition-定義) 内の全ての有効な (from, to, type) 三つ組の集合。このテーブルにないものは構造的に不可能。 |

---

## 言語別実装

tramli は3つの言語実装を持つ **monorepo**:

| 言語 | ディレクトリ | Async | 状態 |
|------|------------|-------|------|
| **Java** | [`java/`](java/) | Sync のみ（I/O は virtual threads） | 安定 |
| **TypeScript** | [`ts/`](ts/) | Sync + optional async（External のみ） | 安定 |
| **Rust** | [`rust/`](rust/) | Sync のみ（async は SM の外） | 安定 |

3つとも同じ **8項目 build 検証**、同じ **FlowDefinition DSL**、同じ **Mermaid 生成**。違いは [`docs/language-guide.md`](docs/language-guide.md) を参照。

共通テストシナリオは [`shared-tests/`](shared-tests/) — 同じフロー定義が3言語でテストされる。

## 要件

| 言語 | バージョン | 依存 |
|------|-----------|------|
| Java | 21+ | ゼロ（Jackson はオプション） |
| TypeScript | Node 18+ / Bun | ゼロ |
| Rust | 1.75+ (edition 2021) | ゼロ |

## ライセンス

MIT
