[English version](plugin-guide.md)

# tramli プラグインガイド

監査ログを残したい、遷移の履歴を調べたい、外部イベントの重複を抑えたいときに、使うプラグインと API・制約を調べるためのリファレンスです。
実際にフローを動かしながら試す手順は[プラグインチュートリアル](tutorial-plugins-ja.md)にあります。
コード例は TypeScript です。日本語版と英語版で、扱う API とコード例を揃えています。

## アーキテクチャ

フロー定義には状態と遷移が書かれていますが、個々のリクエストがどの遷移を通ったか、何秒かかったか、同じ webhook が再送されたかは分かりません。それぞれの Processor に対応を入れると、ログ出力や重複チェックが各所に増えていきます。

tramli のプラグインは、保存処理やエンジンの呼び出しに機能を追加したり、フロー定義を読み取って解析・生成したりします。必要なものだけを使います。フローの実行と、`requires` / `produces` のデータ依存を含む `build()` 時の8項目の構造検証は、引き続きコアが担当します。

この文書は `main` のソースに対応しています。利用する版の API も確認してください。コアのクラスは `@unlaxer/tramli`、プラグインは `@unlaxer/tramli-plugins` から import します。言語によって名前や型引数が異なります。[TypeScript の公開 API](../lang/ts-plugins/src/index.ts)、[Java の実装](../lang/java-plugins/src/main/java/org/unlaxer/tramli/plugins)、[Rust の実装](../lang/rust-plugins/src)を参照してください。

## プラグイン種別 (SPI)

SPI（Service Provider Interface）は、プラグインを追加するためのインターフェースです。以下は TypeScript の6種類の API です。`S` は状態の型、`I` は入力、`O` は出力、`R` はエンジンに結び付けたアダプタを表します。

| やりたいこと | SPI | メソッド | 実装 |
|--------------|-----|----------|------|
| 遷移の保存時に記録を追加する | `StorePlugin` | `wrapStore(store)` | `AuditStorePlugin`, `EventLogStorePlugin` |
| 実行中のログを集める | `EnginePlugin` | `install(engine)` | `ObservabilityEnginePlugin` |
| 再開結果を分類する、重複コマンドを抑える | `RuntimeAdapterPlugin<R>` | `bind(engine)` | `RichResumeRuntimePlugin`, `IdempotencyRuntimePlugin` |
| 設計上のルールを調べる | `AnalysisPlugin<S>` | `analyze(definition, report)` | `PolicyLintPlugin` |
| ソース・図・テスト計画を生成する | `GenerationPlugin<I, O>` | `generate(input)` | `HierarchyGenerationPlugin`, `DiagramGenerationPlugin`, `ScenarioGenerationPlugin` |
| Markdown を生成する | `DocumentationPluginSPI<I>` | `generate(input)` | `FlowDocumentationPlugin` |

`DocumentationPluginSPI` はドキュメント生成インターフェースの公開名です。`DocumentationPlugin` は別の具象クラスで、`toMarkdown()` を持ちます。`GuaranteedSubflowValidator` は直接呼び出すヘルパーであり、登録できる `AnalysisPlugin` ではありません。

## プラグインレジストリ

複数のプラグインを一か所で組み立てるには `PluginRegistry` を使います。登録だけでは動作しません。解析、ストアのラップ、フックの設置、アダプタの作成を、それぞれ必要なタイミングで呼び出します。

この断片では、`FlowDefinition<OrderState>` 型の `definition` が既にあるものとします。[チュートリアル](tutorial-plugins-ja.md)には、フロー定義を含む例があります。

```typescript
import { Tramli, InMemoryFlowStore } from '@unlaxer/tramli';
import {
  PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<OrderState>();
const sink = new InMemoryTelemetrySink();
registry
  .register(PolicyLintPlugin.defaults<OrderState>())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

const report = registry.analyzeAll(definition);
console.log(report.asText());
const store = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(store);
registry.installEnginePlugins(engine);
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');
```

ストアは登録順にラップされます。この例では `EventLogStoreDecorator(AuditingFlowStore(baseStore))` になります。`analyzeAll()` は検出結果を返し、その内容を理由に例外を投げることはありません。`ERROR` を失敗扱いにする場合は `analyzeAndValidate(definition)` または `buildAndAnalyze(builder)` を使います。

`bindRuntimeAdapters()` の戻り値は `Map<string, unknown>` です。型の付いたアダプタが必要なら、`new RichResumeRuntimePlugin().bind(engine)` や `new IdempotencyRuntimePlugin(commandRegistry).bind(engine)` を直接呼び出します。生成用のヘルパーは、メソッドを呼んだときに出力します。登録だけで生成処理が走るわけではありません。

## プラグインの許可範囲

### できること (MAY)

ストアのラップ、ロガーの設置、定義の解析、成果物の生成、再開 API の追加ができます。監査や監視の処理を各 Processor に書き込まずに追加できます。

### できないこと (MAY NOT)

コアの build 時検証や `requires` / `produces` の検証を置き換えるものではありません。階層からコードを生成しても、実行時の状態はフラットであり、並列の状態領域が追加されるわけではありません。イベントログや補償の記録も、コアに完全なイベントソーシングや補償処理の実行機能を持たせるものではありません。

<a id="v1-プラグイン"></a>

## 用途別のプラグイン

以下は用途ごとの独立したコード断片です。各例の `definition`（または `def`）、`engine`、フロー ID、入力データには、アプリケーションで用意したものを渡します。

### Audit

現在の状態だけでなく、遷移時にどんなデータがあったかを調べたいときに使います。`AuditStorePlugin` はストアをラップし、`recordTransition()` の呼び出しごとに `flowId`、`from`、`to`、`trigger`、`timestamp`、`producedDataSnapshot` を記録します。

```typescript
import { AuditStorePlugin } from '@unlaxer/tramli-plugins';

const auditStore = new AuditStorePlugin().wrapStore(new InMemoryFlowStore());
const engine = Tramli.engine(auditStore as any);
const flow = await engine.startFlow(def, 'session-1', initialData);
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('produced:', record.producedDataSnapshot);
}
```

TypeScript 版では、スナップショットにコンテキストの Map の各項目をコピーします。遷移ごとの差分ではなく、値の深いコピーでもありません。元のストアがフローを永続化していても、このラッパーの監査ログはメモリ内に保持されます。上の型キャストは既存の結合テストと同じものです。現在の `Tramli.engine()` は具象型 `InMemoryFlowStore` を受け取るため、ラッパーを直接渡すときに必要になります。

<a id="eventstore-lite-tenure-lite"></a>

### イベントログとリプレイ

問題が起きる前にどの状態まで進んでいたかなど、版番号付きの遷移履歴を調べたいときに `EventLogStorePlugin` を使います。遷移イベントにコンテキストのスナップショットを添えて、メモリ内のログに保持します。

```typescript
import { EventLogStorePlugin, ReplayService, ProjectionReplayService } from '@unlaxer/tramli-plugins';

const eventStore = new EventLogStorePlugin().wrapStore(rawStore);
const events = eventStore.eventsForFlow(flowId);
const stateAtV3 = new ReplayService().stateAtVersion(eventStore.events(), flowId, 3);
const eventCount = new ProjectionReplayService().stateAtVersion(
  eventStore.events(), flowId, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
```

ログを読む前に、`eventStore` を使うエンジンでフローを実行します。`ReplayService.stateAtVersion()` は指定版以下の最後の `TRANSITION` イベントの `to`、または `null` を返します。`FlowContext` の復元や Processor の再実行は行いません。`ProjectionReplayService` は補償イベントも含む該当イベントを入力順に reducer へ渡します。そのため上の例は遷移数ではなくイベント数を数えます。差分から集計する場合は、差分を適用する reducer を用意します。

取り消しに対応する処理を記録したい場合は `CompensationService` を使います。resolver が返した処理名とメタデータを、`COMPENSATION` イベントとして追記します。返金や遷移の巻き戻しは実行しません。それらの処理はアプリケーション側で実装します。

```typescript
import { CompensationService } from '@unlaxer/tramli-plugins';

const compensation = new CompensationService(
  (event, cause) => ({
    action: 'REFUND',
    metadata: { reason: cause.message, originalTransition: event.trigger }
  }),
  eventStore
);
compensation.compensate(failedEvent, error);
```

### Observability

遷移、ガードの判定、エラーのログをまとめて調べたいときに使います。`ObservabilityEnginePlugin` はエンジンのロガーを設定し、`TelemetrySink` にイベントを送ります。手元で確認する場合は `InMemoryTelemetrySink` を使えます。

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine);

for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

フロー実行前に設置し、実行後にイベントを読みます。既定では、既存の遷移・エラー・ガードのロガーを置き換えます。TypeScript では `plugin.install(engine, { append: true })` で既存ロガーを残せます。設置後にロガーの setter を呼ぶと、そのロガーは再び置き換わります。

#### durationMicros (v3.3.0)

遅い処理を調べるには、`TransitionLogEntry`、`ErrorLogEntry`、`GuardLogEntry` の `durationMicros` を見ます（v3.3.0 で追加）。単位は整数のマイクロ秒で、プラグインの `event.data` にも含まれます。ロガーを直接設定する場合は、次のようにしきい値で絞れます。

```typescript
engine.setTransitionLogger(entry => {
  if (entry.durationMicros > 1000) {
    console.warn(`Slow transition: ${entry.from} → ${entry.to} (${entry.durationMicros}μs)`);
  }
});
```

TypeScript は `performance.now()` のミリ秒値を `Math.round((end - start) * 1000)` で変換します。Java は `System.nanoTime()` の値を1000で割り、Rust は `Instant::now()` と `elapsed().as_micros()` を使います。

#### Non-blocking sink パターン

`TelemetrySink.emit()` は同期呼び出しです。HTTP や gRPC で送る場合は、イベントをキューに入れ、コールバックの外で送信します。キューへの追加と取り出しは [non-blocking sink パターン](patterns/non-blocking-sink.md)を参照してください。メモリ内のシンクは外部サービスへ送信しません。

### Rich Resume

`resumeAndExecute()` の結果を呼び出し側で分類して扱いたいときに使います。`previousState` には再開を試す直前の状態を渡します。TypeScript のヘルパーは、返されたフローの状態とこの値を比較します。

```typescript
import { RichResumeExecutor } from '@unlaxer/tramli-plugins';

const executor = new RichResumeExecutor(engine);
const result = await executor.resume(flowId, definition, externalData, previousState);
console.log(result.status, result.flow, result.error);
```

| ステータス | TypeScript での分類条件 |
|------------|------------------------|
| `TRANSITIONED` | 返されたフローの状態が `previousState` と異なる。エラー先への遷移も含み得る。 |
| `ALREADY_COMPLETE` | 状態が変わらず完了したフローが返る、またはエンジンが `FLOW_ALREADY_COMPLETED` を投げる。 |
| `REJECTED` | 返されたフローが未完了で、状態が変わっていない。 |
| `NO_APPLICABLE_TRANSITION` | エンジンが `FLOW_NOT_FOUND` または `INVALID_TRANSITION` を投げる。 |
| `EXCEPTION_ROUTED` | その他の例外がエンジンから出て、`error` に返される。このステータスだけではエラー状態への遷移を確認できない。 |

メモリ内ストアは完了済みフローを更新用に読み込まないため、完了後に直接再開すると `NO_APPLICABLE_TRANSITION` になる場合があります。`ALREADY_COMPLETE` を常に業務処理の成功と解釈しないでください。

### Idempotency

webhook の再送やリトライで、同じコマンドが複数回来る場合に使います。`IdempotentRichResumeExecutor` は Rich Resume を呼ぶ前に `(flowId, commandId)` の組を記録し、同じ組での再実行を抑えます。

```typescript
import { IdempotentRichResumeExecutor, InMemoryIdempotencyRegistry } from '@unlaxer/tramli-plugins';

const idempotent = new IdempotentRichResumeExecutor(engine, new InMemoryIdempotencyRegistry());
const result = await idempotent.resume(flowId, def,
  { commandId: 'cmd-1', externalData: new Map() }, state);
```

重複時は、初回が拒否や失敗だった場合も `ALREADY_COMPLETE` と重複を示すエラーを返します。同じイベントの再送では同じコマンド ID を使います。`InMemoryIdempotencyRegistry` の記録は再起動で失われます。永続化や複数プロセスでの重複排除には、自分で `IdempotencyRegistry` を実装する必要があります。このヘルパーは外部への副作用とコマンド記録を一つの原子的な処理にするものではありません。

### Hierarchy Generation

状態を親子でまとめて記述したいときに使います。`HierarchyCodeGenerator` はフラットな状態設定と builder のひな型を生成します。`HierarchyGenerationPlugin.generate()` は、それらをファイル名からソース文字列への Map にまとめます。

```typescript
import { HierarchyCodeGenerator } from '@unlaxer/tramli-plugins';

const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(hierarchicalSpec));
console.log(gen.generateBuilderSkeleton(hierarchicalSpec));
```

builder の出力に含まれるのは遷移のコメントであり、Processor の実装や遷移宣言は完成していません。それらを補って `build()` で検証します。`EntryExitCompiler.synthesize()` は別途 entry/exit の遷移仕様を作りますが、コード生成器がその結果を自動で取り込むわけではありません。実行時の状態はフラットなままです。

### Lint / Policy

構造検証に通っていても、一つの Processor が多くのデータを生成するなど、設計を見直したい箇所を探すときに使います。`PolicyLintPlugin.defaults()` は次の4種類の警告を出します。

| ポリシー | 警告する条件 |
|----------|--------------|
| `terminal-outgoing` | 終端状態に出力遷移がある。 |
| `external-count` | 一つの状態に外部遷移が3つを超えて存在する。 |
| `dead-data` | 生成されたデータキーがどこでも消費されない。 |
| `overwide-processor` | 一つの Processor が3つを超える型のデータを生成する。 |

```typescript
import { PolicyLintPlugin, PluginReport, allDefaultPolicies } from '@unlaxer/tramli-plugins';
import type { FlowPolicy } from '@unlaxer/tramli-plugins';

const customPolicies: FlowPolicy<OrderState>[] = [
  ...allDefaultPolicies<OrderState>(),
  (def, report) => {
    if (def.allStates().length > 20) {
      report.warn('my-policy/too-many-states', 'Consider splitting this flow');
    }
  }
];
const lint = new PolicyLintPlugin(customPolicies);
const report = new PluginReport();
lint.analyze(definition, report);
console.log(report.asText());
```

#### FindingLocation (v3.3.0)

エディタやレポートで問題の場所を示すには、v3.3.0 で追加された任意の `location` を使います。TypeScript では enum ではなく、`type` で区別するユニオン型です。`warnAt()` と `errorAt()` で位置を付けられます。位置なしの `warn()` と `error()` も使えます。

```typescript
type FindingLocation =
  | { type: 'transition'; fromState: string; toState: string }
  | { type: 'state'; state: string }
  | { type: 'data'; dataKey: string }
  | { type: 'flow' };
```

```typescript
report.warnAt('my-policy', 'Too many transitions', { type: 'state', state: 'PENDING' });
```

### Diagram / Docs / Testing

困りごとに応じて、必要な出力を選びます。

| やりたいこと | ヘルパー | 出力 |
|--------------|----------|------|
| 図とフロー定義のずれを防ぐ | `DiagramPlugin.generate()` | `mermaid`, `dataFlowJson`, `markdownSummary` |
| 状態と遷移の一覧を共有する | `DocumentationPlugin.toMarkdown()` | Markdown のフローカタログ |
| 定義変更後にテストすべきケースを洗い出す | `ScenarioTestPlugin.generate()` | シナリオを含む `FlowTestPlan` |

いずれも定義を読み取ります。業務処理を実行するものではありません。

```typescript
import { DiagramPlugin, DocumentationPlugin, ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

console.log(new DiagramPlugin().generate(definition).mermaid);
console.log(new DocumentationPlugin().toMarkdown(definition));
console.log(new ScenarioTestPlugin().generate(definition).scenarios);
```

SPI に対応するラッパーは `DiagramGenerationPlugin<S>`、`FlowDocumentationPlugin<S>`、`ScenarioGenerationPlugin<S>` です。いずれも `generate(definition)` を持ちます。

#### ScenarioKind (v3.3.0)

v3.3.0 から、シナリオには `happy`、`error`、`guard_rejection`、`timeout` の `kind` が付いています。追加シナリオは、定義に含まれるエラー経路、外部遷移のガード、遷移のタイムアウト設定から生成されます。テストを整理するときは種類で絞れますが、生成された説明だけで Processor の振る舞いを検証できるわけではありません。

```typescript
const plan = new ScenarioTestPlugin().generate(definition);
for (const scenario of plan.scenarios) {
  console.log(`[${scenario.kind}] ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
const errorScenarios = plan.scenarios.filter(s => s.kind === 'error');
const guardScenarios = plan.scenarios.filter(s => s.kind === 'guard_rejection');
```

### SubFlow の検証

子フローの開始時に必要な入力データを、親フローから渡せるか確認したいときに使います。`GuaranteedSubflowValidator` は、子の開始時に利用可能とされるデータと、指定した親の状態で利用可能なデータおよび `guaranteedTypes` を照合し、不足するキーがあれば例外を投げます。両方の定義にデータフローグラフが必要です。

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PAYMENT_PENDING', childDef, new Set());
```

`guaranteedTypes` は、アプリケーションが追加で渡すと約束するデータの宣言です。この検証自体がデータを渡したり、子フローを開始したりすることはありません。
