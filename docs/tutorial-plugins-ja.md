[English version](tutorial-plugins.md)

<a id="プラグインチュートリアル--会話形式"></a>

# プラグインチュートリアル

tramli のプラグインを初めて試すエンジニア向けの手順です。小さなフローを動かし、履歴を読み、同じ外部コマンドを2回送って結果を確認します。
用途に応じたプラグインの選び方、API の詳細、制約は[プラグインガイド](plugin-guide-ja.md)を参照してください。
手順1〜8は一続きの TypeScript の例です。手順9〜11では、必要に応じて使う機能とプラグインの別の組み立て方を説明します。

<a id="第1幕-なぜプラグイン"></a>

## 1. 外部イベントを待つフローを用意する

リクエストの現在の状態は分かっても、そこまでどう進んだかが分からないとします。処理を先へ進めるイベントの再送にも対応したいところです。ここではエンジンの周囲にログ記録と重複排除を追加し、Processor にはそれぞれの遷移の処理を担当させます。

Node.js 20 以上の TypeScript プロジェクトに、TypeScript、`@unlaxer/tramli`、`@unlaxer/tramli-plugins` が入っている状態で始めます。この例はリポジトリの `main` に対応しています。利用する版に、ここで使う API があることを確認してください。

`plugins.mts` を作り、手順1〜8の TypeScript ブロックを順にコピーします。フローは既存の[プラグイン結合テスト](../lang/ts-plugins/tests/plugin-integration.test.ts)のものを使います。`CREATED → PENDING` は自動、`PENDING → CONFIRMED` は外部からの呼び出しを待ち、`CONFIRMED → DONE` は自動で進みます。エラー時の遷移先は `ERROR` です。プラグインの動作を確認するため、この演習ではガードが受け入れる設定にします。

```typescript
import { Tramli, InMemoryFlowStore, flowKey } from '@unlaxer/tramli';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput, FlowContext } from '@unlaxer/tramli';

type S = 'CREATED' | 'PENDING' | 'CONFIRMED' | 'DONE' | 'ERROR';

const config: Record<S, StateConfig> = {
  CREATED:   { terminal: false, initial: true },
  PENDING:   { terminal: false },
  CONFIRMED: { terminal: false },
  DONE:      { terminal: true },
  ERROR:     { terminal: true },
};

interface Input { value: string }
interface Middle { processed: boolean }
interface Output { result: string }

const InputKey = flowKey<Input>('Input');
const MiddleKey = flowKey<Middle>('Middle');
const OutputKey = flowKey<Output>('Output');

const proc1: StateProcessor<S> = {
  name: 'Proc1',
  requires: [InputKey],
  produces: [MiddleKey],
  process(ctx: FlowContext) {
    const input = ctx.get(InputKey);
    ctx.put(MiddleKey, { processed: true });
  },
};

const proc2: StateProcessor<S> = {
  name: 'Proc2',
  requires: [MiddleKey],
  produces: [OutputKey],
  process(ctx: FlowContext) {
    ctx.put(OutputKey, { result: 'done' });
  },
};

function testGuard(accept: boolean): TransitionGuard<S> {
  return {
    name: 'TestGuard',
    requires: [MiddleKey],
    produces: [],
    maxRetries: 3,
    validate(_ctx: FlowContext): GuardOutput {
      return accept
        ? { type: 'accepted' }
        : { type: 'rejected', reason: 'declined' };
    },
  };
}

function buildDef(accept = true) {
  return Tramli.define<S>('test', config)
    .setTtl(5 * 60 * 1000)
    .initiallyAvailable(InputKey)
    .from('CREATED').auto('PENDING', proc1)
    .from('PENDING').external('CONFIRMED', testGuard(accept))
    .from('CONFIRMED').auto('DONE', proc2)
    .onAnyError('ERROR')
    .build();
}

const def = buildDef(true);
```

<a id="第7幕-lintポリシー"></a>

## 2. lint で定義を確認する

構造検証に通っていても、使われないデータや、出力の多すぎる Processor があるかもしれません。`build()` の後に `PolicyLintPlugin` を実行して、見直す箇所を探します。

```typescript
import { PolicyLintPlugin, PluginReport } from '@unlaxer/tramli-plugins';

const lint = PolicyLintPlugin.defaults<S>();
const report = new PluginReport();
lint.analyze(def, report);
console.log(report.asText());
for (const finding of report.findings()) {
  if (finding.location?.type === 'transition') {
    console.warn(`${finding.message} @ ${finding.location.fromState} → ${finding.location.toState}`);
  }
}
```

`Proc2` が生成した `Output` を後続のステップが読まないため、`policy/dead-data` の警告が出ます。これは設計を確認するための警告で、build の失敗ではありません。4種類の既定ポリシー、しきい値、独自ポリシーや位置情報の追加方法は[ガイド](plugin-guide-ja.md#lint--policy)にあります。

<a id="第3幕-audit--何が起きた"></a>

## 3. ストアに監査ログとイベントログを追加する

遷移時のデータを調べるには `AuditStorePlugin`、版番号付きの遷移履歴を調べるには `EventLogStorePlugin` を使います。エンジンを作る前にストアをラップします。後でそれぞれのログを読めるよう、両方のラッパーを変数に保持します。

```typescript
import { AuditStorePlugin, EventLogStorePlugin } from '@unlaxer/tramli-plugins';

const rawStore = new InMemoryFlowStore();
const auditStore = new AuditStorePlugin().wrapStore(rawStore);
const eventStore = new EventLogStorePlugin().wrapStore(auditStore);
const engine = Tramli.engine(eventStore as any);
```

型キャストは結合テストと同じものです。現在の TypeScript の `Tramli.engine()` は具象型 `InMemoryFlowStore` を受け取りますが、ラッパーもエンジンが使うメソッドを備えています。これらのログはメモリ内に保持されます。永続化するストアをラップしただけでは、ログまで永続化されません。

<a id="第6幕-オブザーバビリティ"></a>

## 4. 実行中のログと処理時間を集める

どのガードが動いたか、どの遷移が遅かったかを調べるため、実行前に `ObservabilityEnginePlugin` を設置します。この例では、1000マイクロ秒（1ミリ秒）を超える遷移を警告するロガーも残します。

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

engine.setTransitionLogger(entry => {
  if (entry.durationMicros > 1000) {
    console.warn(`Slow transition: ${entry.from} → ${entry.to} (${entry.durationMicros}μs)`);
  }
});
const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine, { append: true });
```

`append: true` で既存ロガーを残します。既定の設置方法では置き換わります。遷移・エラー・ガードのログには、整数の `durationMicros` が含まれます。外部へ送信する場合は `TelemetrySink` を実装し、同期メソッドの `emit()` ではキューに入れるなど短い処理にします。[non-blocking sink パターン](patterns/non-blocking-sink.md)を参照してください。

## 5. フローを開始して最初の遷移を見る

`Proc1` が必要とする入力を渡して開始します。エンジンはこの Processor を実行し、外部からの呼び出しを待つ `PENDING` で止まります。監査ログで、その時点のコンテキストを確認します。

```typescript
const flow = await engine.startFlow(def, 's1',
  new Map([[InputKey as string, { value: 'test' }]]));
console.log(flow.currentState);
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('produced:', record.producedDataSnapshot);
}
```

`PENDING` と、`CREATED → PENDING` の監査記録が出ます。`producedDataSnapshot` には、名前に反してその遷移が生成したデータだけでなく、記録時のコンテキストの全項目が入ります。この時点では `Input` と `Middle` を含みます。

<a id="第5幕-rich-resume-と冪等性"></a>

## 6. 重複を抑えてフローを再開する

イベントの送信側は、応答を受け取れなかったときに再送することがあります。同じイベントには同じコマンド ID を付け、2回目にフローを再実行しないようにします。`IdempotentRichResumeExecutor` は Rich Resume による結果の分類に、コマンドの記録を加えます。

```typescript
import { InMemoryIdempotencyRegistry, IdempotentRichResumeExecutor } from '@unlaxer/tramli-plugins';

const commandRegistry = new InMemoryIdempotencyRegistry();
const executor = new IdempotentRichResumeExecutor(engine, commandRegistry);
const previousState = flow.currentState;
const r1 = await executor.resume(flow.id, def,
  { commandId: 'cmd-1', externalData: new Map() }, previousState);
console.log(r1.status, r1.flow?.currentState);
const r2 = await executor.resume(flow.id, def,
  { commandId: 'cmd-1', externalData: new Map() }, previousState);
console.log(r2.status, r2.error?.message);
```

`TRANSITIONED DONE` の後に、`ALREADY_COMPLETE` と `duplicate commandId cmd-1` が出ます。この演習のガードは既存コンテキストの `Middle` を読むため、外部データの Map は空で構いません。アプリケーションでは、その外部遷移が必要とするデータを渡します。

重複排除が不要なら `new RichResumeExecutor(engine).resume(flowId, definition, externalData, previousState)` を使います。5種類の結果は[ガイドのステータス表](plugin-guide-ja.md#rich-resume)にあります。ここでの `ALREADY_COMPLETE` は、コマンドを既に受け取ったという意味です。ID は実行前に記録され、拒否や失敗でも記録が残るため、業務処理の成功を意味しません。メモリ内レジストリの記録は再起動でも失われます。

<a id="第4幕-event-store--リプレイと補償"></a>

## 7. 履歴と実行ログを読む

ある版でどこまで進んでいたかを調べるには、実行後にイベントログを読みます。`ReplayService` は状態名を返します。独自の集計には `ProjectionReplayService` に reducer を渡します。

```typescript
import { ReplayService, ProjectionReplayService } from '@unlaxer/tramli-plugins';

const events = eventStore.eventsForFlow(flow.id);
console.log(events.map(event => [event.version, event.from, event.to]));
const stateAtV3 = new ReplayService().stateAtVersion(eventStore.events(), flow.id, 3);
console.log(stateAtV3);
const eventCount = new ProjectionReplayService().stateAtVersion(
  eventStore.events(), flow.id, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
console.log(eventCount);
for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

遷移イベントは3件です。版1で `PENDING`、版2で `CONFIRMED`、版3で `DONE` へ進みます。`stateAtV3` は `DONE`、イベント数は3です。重複コマンドによる遷移は増えません。シンクには遷移イベントとガードの判定結果が入ります。

リプレイは Processor の再実行やデータの復元を行いません。失敗後の返金などを記録したい場合は、[CompensationService](plugin-guide-ja.md#イベントログとリプレイ) が resolver の返した内容を補償イベントとして追記します。返金自体は実行しません。補償イベントがある場合、上の reducer はそれも数えます。

<a id="第8幕-生成プラグイン"></a>

## 8. 図・ドキュメント・テスト計画を生成する

### ダイアグラム

図とフロー定義のずれを防ぐには、`DiagramPlugin` で定義から図を生成します。出力にはデータフローグラフの JSON と Markdown の概要も含まれます。

```typescript
import { DiagramPlugin } from '@unlaxer/tramli-plugins';

const bundle = new DiagramPlugin().generate(def);
console.log(bundle.mermaid);
console.log(bundle.dataFlowJson);
console.log(bundle.markdownSummary);
```

<a id="第9幕-ドキュメント生成"></a>

### ドキュメント

状態と遷移の一覧を共有したいときは `DocumentationPlugin` を使います。この例では、`# Flow Catalog: test` から始まる Markdown に、手順1の状態と遷移が並びます。

```typescript
import { DocumentationPlugin } from '@unlaxer/tramli-plugins';

const md = new DocumentationPlugin().toMarkdown(def);
console.log(md);
```

### テストシナリオ

テストすべきケースを確認したいときは `ScenarioTestPlugin` で計画を生成します。各シナリオには開始状態、きっかけ、期待する遷移先が書かれます。`kind` は定義に応じて `happy`、`error`、`guard_rejection`、`timeout` になります。

```typescript
import { ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

const plan = new ScenarioTestPlugin().generate(def);
for (const scenario of plan.scenarios) {
  console.log(`[${scenario.kind}] ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
```

正常系・エラー・ガード拒否のシナリオが出ます。この定義にはフロー全体の TTL はありますが、遷移ごとのタイムアウトがないため `timeout` シナリオは出ません。`generate()` の出力は説明文なので、Processor の振る舞いを確かめるテストは別途必要です。

ここまでのファイルをプロジェクトから実行します。

```bash
npx tsc plugins.mts --target ES2022 --module NodeNext --strict --skipLibCheck
node plugins.mjs
```

<a id="階層"></a>

## 9. 必要に応じて階層からフラットな定義を生成する

関連する状態を親子でまとめた方が書きやすいときは、階層用のヘルパーを使います。次の独立した例では、`PROCESSING` の子として `VALIDATING` と `CONFIRMING` を定義し、ソース文字列を表示します。

```typescript
import { flowSpec, stateSpec, transitionSpec,
  EntryExitCompiler, HierarchyCodeGenerator } from '@unlaxer/tramli-plugins';

const spec = flowSpec('Order', 'OrderState');
const processing = stateSpec('PROCESSING', { initial: true });
processing.entryProduces.push('AuditLog');
processing.children.push(stateSpec('VALIDATING'));
processing.children.push(stateSpec('CONFIRMING'));
spec.rootStates.push(processing);
spec.rootStates.push(stateSpec('DONE', { terminal: true }));
spec.transitions.push(transitionSpec('PROCESSING', 'DONE', 'complete'));

const entryExit = new EntryExitCompiler().synthesize(spec);
console.log(entryExit);
const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(spec));
console.log(gen.generateBuilderSkeleton(spec));
```

生成される状態設定はフラットです。builder には遷移のコメントが入るため、実際の遷移宣言と Processor を補い、`build()` で検証します。entry/exit の仕様は別の出力であり、生成された builder へ自動挿入されません。実行時に階層状態が追加されるわけではありません。

<a id="第10幕-subflow-検証"></a>

## 10. 必要に応じて子フローへの入力を検証する

親から子フローを開始する場合は、子が開始時に必要と宣言したデータを渡せるか確認します。`GuaranteedSubflowValidator` が両方の定義を照合します。結合テストから取った次の例では、子に必要な入力がないため検証に通ります。演習のファイルに追記できます。

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const parentDef = buildDef(true);
const subConfig: Record<'SUB_A' | 'SUB_B', StateConfig> = {
  SUB_A: { terminal: false, initial: true },
  SUB_B: { terminal: true },
};
const subDef = Tramli.define<'SUB_A' | 'SUB_B'>('sub', subConfig)
  .from('SUB_A').auto('SUB_B', {
    name: 'SubProc', requires: [], produces: [],
    process() {},
  })
  .build();
const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PENDING', subDef, new Set());
```

実際の子フローで入力キーが不足する場合は例外になります。第4引数の `guaranteedTypes` には、アプリケーションが実行時に追加で渡すキーを宣言できます。この呼び出しは宣言を検証するだけで、データの注入や子の起動は行いません。

<a id="第2幕-6種類のspi"></a>

<a id="第11幕-全部まとめて"></a>

## 11. 別の組み立て方：レジストリにまとめる

使うプラグインが増えたら、`PluginRegistry` に設定をまとめられます。レジストリは、プラグインをどこに接続するかを定めた SPI インターフェースを通じて呼び出します。6種類のインターフェースは[ガイド](plugin-guide-ja.md#プラグイン種別-spi)にあります。

以下は手順2〜4と6の手動設定に代わる例です。手順1の定義と合わせて別ファイルで使ってください。設定済みのエンジンへの追記用ではありません。

```typescript
import {
  PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<S>();
const sink = new InMemoryTelemetrySink();
registry
  .register(PolicyLintPlugin.defaults<S>())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

const report = registry.analyzeAll(def);
console.log(report.asText());
const store = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(store);
registry.installEnginePlugins(engine);
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');
```

`report` を確認し、手順5と同じように `engine` でフローを開始します。実行用アダプタの Map は値を `unknown` として保持します。型を付けて直接アダプタを作る方法は[ガイド](plugin-guide-ja.md#プラグインレジストリ)にあります。図やドキュメントは手順8のヘルパーを直接呼んで生成します。登録だけで解析、フック設置、生成処理が実行されるわけではありません。
