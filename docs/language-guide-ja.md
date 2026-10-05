[English version](language-guide.md)

# 言語ガイド — Java / TypeScript / Rust

tramli を初めて使う方や、別の言語にフローを移植する方に向けたガイドです。
基本はアプリケーションと同じ言語版を選びます。フローの考え方と `build()` 時の8項目の検証は共通で、API の書き方、データのキー、非同期 I/O の扱いが異なります。
以下の表とコード例で、Processor を書く前に知っておきたい違いを説明します。

## どの言語を使うべきか

| スタック | 選ぶ実装 | I/O の扱い |
|---------|----------|------------|
| Java / Kotlin / Spring | [Java 版](../lang/java/)（Java 21 以降） | 同期のエンジンを呼び出します。必要に応じて呼び出し側で仮想スレッドや `CompletableFuture` を使います。 |
| Node.js / Deno / Bun | [TypeScript 版](../lang/ts/) | エンジンの呼び出しを `await` します。Auto の Processor は同期にし、非同期 I/O はエンジンの外か External 遷移で扱います。 |
| Rust / システムプログラミング | [Rust 版](../lang/rust/) | アプリケーションから同期のエンジンを呼び出し、I/O の `await` はその外で行います。 |
| 複数言語のサービス | サービスごとに選択 | フローの構造とデータの入出力の宣言を揃え、API の呼び方を各言語に合わせます。 |

## 核心原則

注文フローでは、支払い要求を用意し、決済サービスの応答を待ってから、発送の準備へ進みます。要求を用意する処理に HTTP 呼び出しまで含めると、その処理が通信の遅延や失敗も扱うことになります。別の言語に移す際も、判断のロジックと I/O の組み込み方を両方書き直す必要があります。

tramli では、3種類の遷移で処理を分けます。

- **Auto**: 外部イベントを待たず、自動で次に進みます。
- **External**: アプリケーションが外部のデータを渡して再開するまで待ちます。
- **Branch**: 宣言済みの候補から次の状態を選びます。

どの言語版でも、状態はフラットに定義します。Processor は各遷移で実行するアプリケーションの処理で、読むデータ（`requires`）と書くデータ（`produces`）を宣言します。`build()` を呼ぶと、必要なデータがどの経路でも揃うかなど、8項目の構造を検証します。コンパイラが調べるのは言語の型であり、フロー定義を調べるのは `build()` が実行された時点です。

推奨する I/O の流れも共通です。External の待機まで進め、呼び出し側で I/O を行い、その結果を渡して再開します。TypeScript では、後述する非同期コールバックも利用できます。一連の手順は[非同期 I/O 統合ガイド](async-integration.md)を参照してください。

## 言語別 Async 戦略

ここでの**同期**とは、値を返すか例外を投げるまで呼び出し元に制御が戻らないことです。**非同期**では、`Promise` や非同期ランタイムを通して完了を待ちます。同期メソッドであっても、中に I/O を書けばその完了まで待たされます。

### Java: Sync のみ

エンジンと Processor のコールバックは同期です。HTTP 呼び出しや DB クエリは呼び出し側で行い、結果を渡してフローを再開します。Java 21 の仮想スレッドなら、呼び出し側でブロッキング I/O の API を使えます。`CompletableFuture` を使う方法もあります。

次は呼び出し部分の抜粋です。`definition`、`initialData`、`flowId`、`data` はアプリケーション側で用意します。

```java
engine.startFlow(definition, null, initialData);      // sync, ~1μs
engine.resumeAndExecute(flowId, definition, data);    // sync, ~300ns
```

開始時の約1μs、再開時の約300ns は、このガイドで示しているエンジン処理のみの概算値です。応答時間を保証するものではなく、利用者が書いた Processor、ストレージ、I/O の時間は含みません。

### TypeScript: Sync + optional async

エンジンの呼び出しは `Promise<FlowInstance>` を返すため、すべての Processor が同期でも `await` が必要です。`StateProcessor` の `name`、`requires`、`produces` はプロパティとして宣言し、`process` は `void` または `Promise<void>` を返します。

Auto の Processor は同期にして、自動で連続実行する区間を手元のデータ処理に限定します。次は既存の[注文フローの例](../lang/ts/tests/order-flow.test.ts)です。注文データを読み、決済サービスには通信せずに支払い要求を作ります。`OrderRequest` と `PaymentIntent` は、この例で定義されている型付きのデータキーです。

```typescript
const orderInit: StateProcessor<OrderState> = {
  name: 'OrderInit',
  requires: [OrderRequest],
  produces: [PaymentIntent],
  process(ctx: FlowContext) {
    const req = ctx.get(OrderRequest);
    ctx.put(PaymentIntent, { transactionId: `txn-${req.itemId}` });
  },
};
```

External 遷移の中で I/O を行う場合も、同じ `StateProcessor` の `process` を `async` にします。非同期専用の Processor 型はありません。[External の Processor の例](async-integration.md#why-typescript-has-optional-async--and-javarust-dont)を参照してください。

設計上のルールは、Auto の Processor と Branch の判断を同期にし、非同期コールバックを External 遷移に限ることです。ただし、これは型による制限ではなく使い方の方針です。現在の TypeScript の型定義はこれらのコールバックで Promise も受け付け、エンジンも `await` します。[コールバックの型定義](../lang/ts/src/types.ts)と[エンジンの実装](../lang/ts/src/flow-engine.ts)で確認できます。

### Rust: Sync のみ

エンジンと Processor の trait は同期です。非同期の HTTP ハンドラやタスクから、I/O を `await` する前後に呼び出せます。エンジン自体には非同期ランタイムが不要です。

次は [Rust の Quick start](../lang/rust/README.md#quick-start) の抜粋です。`def` は `Arc<FlowDefinition<OrderState>>` です。この例の guard は外部データを必要としないため、空のベクタを渡しています。

```rust
let mut engine = FlowEngine::new(InMemoryFlowStore::new());
let flow_id = engine.start_flow(def, "session-1", vec![]).unwrap();

engine.resume_and_execute(&flow_id, vec![]).unwrap();
```

`start_flow` はフロー ID を `Result` で返します。`resume_and_execute` はその ID と外部データを受け取り、`Result<(), FlowError>` を返します。定義はフローと一緒に保持されるため、再開時に渡し直す必要はありません。I/O の結果を渡す方法は[非同期 I/O 統合ガイド](async-integration.md#how-to-use-with-async-runtimes)を参照してください。

## Sync vs. Async — 言語別サポート一覧

以下は、推奨するコールバックの使い分けです。Java と Rust のコールバックは型定義上も同期です。TypeScript の型定義は、上で説明したとおり、推奨より広い範囲を受け付けます。

| コールバック | Java | Rust | TypeScript |
|---|---|---|---|
| `StateProcessor.process` | 同期 | 同期 | Auto は同期、External は同期または非同期 `Promise<void>` |
| `TransitionGuard.validate` | 同期 | 同期 | External で同期または非同期 `Promise<GuardOutput>` |
| `BranchProcessor.decide` | 同期 | 同期 | 同期を推奨 |
| `FlowEngine.startFlow` / Rust の `start_flow` | 同期 | 同期 | 非同期（`Promise<FlowInstance>`） |
| `FlowEngine.resumeAndExecute` / Rust の `resume_and_execute` | 同期 | 同期 | 非同期（`Promise<FlowInstance>`） |

設計方針は[仕様書の §1.3a](../spec/SPEC.md#13a-sync-vs-async--per-language-processor-support)にも記載されています。

## API 比較

考え方は共通ですが、呼び方は各言語で異なります。表中の `S` は利用者が定義する状態の型、`stateConfig` は TypeScript で初期状態・終端状態のフラグを持つレコードです。guard は External のイベントを受理・拒否・期限切れのいずれかに判断し、`FlowContext` は処理間で受け渡すデータを保持します。

| 概念 | Java | TypeScript | Rust |
|------|------|------------|------|
| 状態 | `enum S implements FlowState` | 文字列 union `S` + `Record<S, StateConfig>` | `enum S` + `FlowState` trait |
| Processor | `interface StateProcessor` | `StateProcessor<S>` オブジェクト | `trait StateProcessor<S>` |
| Guard 出力 | `sealed interface GuardOutput` | discriminated union | `enum GuardOutput` |
| Flow context のキー | `Class<T>` | `FlowKey<T>`（型情報を付けた文字列） | `TypeId` |
| 定義 | `Tramli.define("name", S.class)` | `Tramli.define("name", stateConfig)` | `Builder::<S>::new("name")` |
| Build 検証 | `build()` が `FlowException` を投げる | `build()` が `FlowError` を投げる | `build()` が `Result` を返す |
| Mermaid 状態遷移図 | `MermaidGenerator.generate(def)` | `MermaidGenerator.generate(def)` | `MermaidGenerator::generate(&def)` |
| Data-flow Mermaid | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator.generateDataFlow(def)` | `MermaidGenerator::generate_data_flow(&def)` |
| DataFlowGraph | `def.dataFlowGraph()` | `def.dataFlowGraph` | `def.data_flow_graph()` |
| SubFlow | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.subFlow(sub).onExit("X", S).endSubFlow()` | `.sub_flow(runner).on_exit("X", S).end_sub_flow()` |
| 明示的 External trigger | `.externalOn(Event.class, to, guard)` | `.externalOn(Event, to, guard)` | `.external_on::<Event>(to, guard)` |
| 状態のパス | `flow.statePathString()` | `flow.statePathString()` | `flow.state_path_string()` |
| 待機中の型 | `flow.waitingFor()` | `flow.waitingFor()` | `flow.waiting_for()` |
| エントリポイント | `Tramli.define()` | `Tramli.define()` | `Builder::new()` |

## 型安全性の比較

言語がコンパイル時に行う型検査と、tramli が `build()` で行うフローの検証は別のものです。たとえば、ある分岐で後続処理に必要なデータを作っていなければ、コンパイルを通っても `build()` でエラーになります。

| 機能 | Java | TypeScript | Rust |
|------|------|------------|------|
| 状態の網羅性 | enum。検査は switch の形式による | 文字列 union。網羅性の検査を明示的に書く | enum。`match` はすべての候補を扱う必要がある |
| Guard 出力 | sealed interface | discriminated union | enum と網羅的な match |
| Context の型安全性 | `Class<T>` のキーで戻り値の型が決まる | `FlowKey<T>` で戻り値の型が決まる。格納値は型アサーションで扱い、実行時の型検証はしない | `TypeId` で検索し、downcast で型を確認する |
| Build エラー | `build()` 実行時の `FlowException` | `build()` 実行時の `FlowError` | `build()` 実行時の `Err(FlowError)` |

新しい言語への移植で考慮する言語機能は[言語互換性マトリクス](language-compatibility-matrix.md)、公開 API のバージョン間の互換性は [API 安定性レベル](api-stability.md)を参照してください。

## ファイル構成

各実装は `lang/` 以下にあります。共通シナリオには、3言語のテストで使う同じフローが記述されています。

```text
tramli/
├── lang/
│   ├── java/
│   │   ├── pom.xml
│   │   └── src/main/java/org/unlaxer/tramli/
│   │       ├── Tramli.java
│   │       ├── FlowDefinition.java
│   │       └── FlowEngine.java
│   ├── ts/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── flow-definition.ts
│   │       └── flow-engine.ts
│   └── rust/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── definition.rs
│           └── engine.rs
├── shared-tests/scenarios/
│   └── order-happy-path.yaml
└── docs/
    ├── async-integration.md
    ├── language-guide.md
    └── language-guide-ja.md
```
