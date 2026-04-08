[English version](tutorial-plugins.md)

# プラグインチュートリアル — 会話形式

*新人 (N) と作者 (A) が、tramli のプラグインシステムをゼロから学ぶ。*

---

## 第1幕: なぜプラグイン？

**N:** README を読みました。コアエンジンには8つの構成要素と凍結された検証カーネルがある。じゃあ、監査やオブザーバビリティはどこに？

**A:** それがプラグインシステムの出番だ。コア — FlowState、StateProcessor、TransitionGuard、BranchProcessor、FlowContext、FlowDefinition、FlowEngine、FlowStore — は変わらない。プラグインが6種類のSPIを使って上に重なる。

**N:** SPIって？

**A:** Service Provider Interface。各SPIが1つのフックポイントを定義する。インターフェースを実装して、登録するだけ。

---

## 第2幕: 6種類のSPI

**N:** その6つは？

**A:** 順に見ていこう:

1. **AnalysisPlugin** — `FlowDefinition` に対する静的解析。ステートマシンのlintだと思えばいい。
2. **StorePlugin** — `FlowStore` をデコレータでラップ。AuditとEventLogプラグインがこれ。
3. **EnginePlugin** — `FlowEngine` にフックを仕込む（例: オブザーバビリティ用のロガー）。
4. **RuntimeAdapterPlugin** — エンジンをリッチなAPIにバインド。RichResumeとIdempotencyがこれ。
5. **GenerationPlugin** — 入力を受け取り、出力を生成。Diagram、Hierarchy、Scenarioプラグインがこれ。
6. **DocumentationPlugin** — GenerationPluginの特殊化。文字列を返す。

**N:** PluginRegistryがそれらを束ねる？

**A:** そう。プラグインを登録して、ライフサイクルメソッドを順に呼ぶ:

```typescript
import { PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<OrderState>();
const sink = new InMemoryTelemetrySink();

registry
  .register(PolicyLintPlugin.defaults())           // Analysis
  .register(new AuditStorePlugin())                // Store
  .register(new EventLogStorePlugin())             // Store
  .register(new ObservabilityEnginePlugin(sink));   // Engine

// 1. 定義をLint
const report = registry.analyzeAll(definition);
console.log(report.asText());

// 2. Store をラップ
const store = new InMemoryFlowStore();
const wrappedStore = registry.applyStorePlugins(store);

// 3. ラップされたStoreでエンジンを作成、フックを設置
const engine = Tramli.engine(wrappedStore);
registry.installEnginePlugins(engine);

// 4. ランタイムアダプタをバインド
const adapters = registry.bindRuntimeAdapters(engine);
```

---

## 第3幕: Audit — 「何が起きた？」

**N:** 具体的なところから。監査はどう動く？

**A:** `AuditStorePlugin` が FlowStore をラップする。`recordTransition` が呼ばれるたびに、遷移メタデータと生成データのスナップショットをキャプチャする。

```typescript
import { AuditStorePlugin, AuditingFlowStore } from '@unlaxer/tramli-plugins';

const rawStore = new InMemoryFlowStore();
const auditStore = new AuditStorePlugin().wrapStore(rawStore);
const engine = Tramli.engine(auditStore);

// フローを実行...
const flow = await engine.startFlow(def, 'session-1', initialData);

// 監査ログを検査
for (const record of auditStore.auditedTransitions) {
  console.log(`${record.from} → ${record.to} at ${record.timestamp}`);
  console.log('  produced:', record.producedDataSnapshot);
}
```

**N:** 非侵襲的？プロセッサは監査を意識しない？

**A:** その通り。デコレータパターン。結合度ゼロ。

---

## 第4幕: Event Store — リプレイと補償

**N:** イベントソーシングは？

**A:** 「Tenure-lite」がある — フルイベントソーシングよりも意図的に軽い。`EventLogStorePlugin` がストアをラップして、バージョン付きイベントを追記する。

```typescript
import { EventLogStorePlugin, EventLogStoreDecorator,
  ReplayService, ProjectionReplayService, CompensationService
} from '@unlaxer/tramli-plugins';

const eventStore = new EventLogStorePlugin().wrapStore(rawStore);
const engine = Tramli.engine(eventStore);

// フロー実行後、イベントログをクエリ:
const events = eventStore.eventsForFlow(flowId);
```

**N:** リプレイは？

**A:** `ReplayService` が任意のバージョンで状態を再構築する:

```typescript
const replay = new ReplayService();
const stateAtV3 = replay.stateAtVersion(eventStore.events(), flowId, 3);
// → 'CONFIRMED'
```

カスタム集計には `ProjectionReplayService` をReducerと一緒に使う:

```typescript
const projection = new ProjectionReplayService();
const transitionCount = projection.stateAtVersion(
  eventStore.events(), flowId, 999,
  { initialState: () => 0, apply: (count, event) => count + 1 }
);
```

**N:** 補償 — Sagaパターンは？

**A:** `CompensationService` がリゾルバ関数を受け取り、補償イベントを記録する:

```typescript
const compensation = new CompensationService(
  (event, cause) => ({
    action: 'REFUND',
    metadata: { reason: cause.message, originalTransition: event.trigger }
  }),
  eventStore
);

// 遷移が失敗したとき:
compensation.compensate(failedEvent, error);
// → COMPENSATION イベントをログに追記
```

---

## 第5幕: Rich Resume と冪等性

**N:** コアの `resumeAndExecute` はフローを返すだけ。実際に遷移したかどうかはどう判断する？

**A:** `RichResumeExecutor` がやってくれる。結果を分類する:

```typescript
import { RichResumeExecutor } from '@unlaxer/tramli-plugins';

const executor = new RichResumeExecutor(engine);
const result = await executor.resume(flowId, definition, externalData, previousState);

switch (result.status) {
  case 'TRANSITIONED':        // 新しい状態に遷移した
  case 'ALREADY_COMPLETE':    // フローは既に完了していた
  case 'REJECTED':            // ガードが拒否、遷移なし
  case 'NO_APPLICABLE_TRANSITION': // 適用可能な遷移が見つからない
  case 'EXCEPTION_ROUTED':    // エラーがエラー状態にルーティングされた
}
```

**N:** 冪等性は？

**A:** `IdempotentRichResumeExecutor` が RichResume をコマンドレジストリでラップする:

```typescript
import { InMemoryIdempotencyRegistry, IdempotentRichResumeExecutor } from '@unlaxer/tramli-plugins';

const registry = new InMemoryIdempotencyRegistry();
const executor = new IdempotentRichResumeExecutor(engine, registry);

// 初回は正常に処理
const r1 = await executor.resume(flowId, definition,
  { commandId: 'cmd-abc', externalData: new Map() }, previousState);
// r1.status === 'TRANSITIONED'

// 重複は抑制
const r2 = await executor.resume(flowId, definition,
  { commandId: 'cmd-abc', externalData: new Map() }, previousState);
// r2.status === 'ALREADY_COMPLETE'
```

**N:** ユーザーアクションごとにユニークな commandId を振るだけ？

**A:** それだけ。`InMemoryIdempotencyRegistry` はテスト用。本番では Redis やデータベースでバックする。

---

## 第6幕: オブザーバビリティ

**N:** 本番でフローを監視するには？

**A:** `ObservabilityEnginePlugin` がエンジンにロガーフックを設置する。イベントは `TelemetrySink` に流れる:

```typescript
import { ObservabilityEnginePlugin, InMemoryTelemetrySink } from '@unlaxer/tramli-plugins';

const sink = new InMemoryTelemetrySink();
const plugin = new ObservabilityEnginePlugin(sink);
plugin.install(engine);

// フロー実行後:
for (const event of sink.events()) {
  console.log(`[${event.type}] ${event.flowId}: ${JSON.stringify(event.data)}`);
}
```

**N:** PrometheusやDatadogにパイプできる？

**A:** `TelemetrySink` インターフェースを実装して、`emit()` からメトリクスを送信すればいい。`InMemoryTelemetrySink` はテスト用。

---

## 第7幕: Lintポリシー

**N:** さっきLintって言ってたよね。何をチェックする？

**A:** `PolicyLintPlugin` はデフォルトで4つのポリシーを実行する:

1. **terminal-outgoing** — 終端状態に出力遷移があってはいけない
2. **external-count** — 1つの状態に外部遷移が3つ以上あると警告
3. **dead-data** — 生成されたが消費されない型
4. **overwide-processor** — 3つ以上の型を生成するプロセッサ

```typescript
import { PolicyLintPlugin, PluginReport } from '@unlaxer/tramli-plugins';

const lint = PolicyLintPlugin.defaults();
const report = new PluginReport();
lint.analyze(definition, report);

for (const finding of report.findings()) {
  console.warn(`[${finding.severity}] ${finding.pluginId}: ${finding.message}`);
}
```

**N:** カスタムポリシーは追加できる？

**A:** もちろん。ポリシーは `(definition, report) => void` の関数:

```typescript
const customPolicies = [
  ...allDefaultPolicies(),
  (def, report) => {
    if (def.allStates().length > 20) {
      report.warn('my-policy/too-many-states', 'フローの分割を検討してください');
    }
  }
];
const lint = new PolicyLintPlugin(customPolicies);
```

---

## 第8幕: 生成プラグイン

### ダイアグラム

**N:** tramli は Mermaid 図を生成できるよね。プラグインは何を追加する？

**A:** `DiagramGenerationPlugin` が3つの出力を一括で生成する:

```typescript
import { DiagramPlugin } from '@unlaxer/tramli-plugins';

const bundle = new DiagramPlugin().generate(definition);
// bundle.mermaid         → Mermaid stateDiagram-v2
// bundle.dataFlowJson    → JSON データフローグラフ
// bundle.markdownSummary → 概要統計
```

### 階層

**N:** Hierarchyプラグインは何のため？

**A:** 状態の階層（親子）を記述して、tramli のフラットenumモデルに平坦化する:

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

// エントリ/エグジット遷移を合成
const entryExit = new EntryExitCompiler().synthesize(spec);

// TypeScript ソースを生成
const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(spec));
console.log(gen.generateBuilderSkeleton(spec));
```

### テストシナリオ

**N:** フロー定義からBDD？

**A:** `ScenarioTestPlugin` が遷移ごとに1シナリオを生成する:

```typescript
import { ScenarioTestPlugin } from '@unlaxer/tramli-plugins';

const plan = new ScenarioTestPlugin().generate(definition);
for (const scenario of plan.scenarios) {
  console.log(`シナリオ: ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
// 出力:
//   シナリオ: CREATED_to_PENDING
//     given flow in CREATED
//     when auto processor OrderInit runs
//     then flow reaches PENDING
```

---

## 第9幕: ドキュメント生成

**N:** ドキュメント生成は？

**A:** `DocumentationPlugin` がマークダウン形式のフローカタログを生成する:

```typescript
import { DocumentationPlugin } from '@unlaxer/tramli-plugins';

const md = new DocumentationPlugin().toMarkdown(definition);
console.log(md);
// # Flow Catalog: order
//
// ## States
// - `CREATED` (initial)
// - `PAYMENT_PENDING`
// - `PAYMENT_CONFIRMED`
// - `SHIPPED` (terminal)
// - `CANCELLED` (terminal)
//
// ## Transitions
// - `CREATED -> PAYMENT_PENDING` via `OrderInit`
// ...
```

---

## 第10幕: SubFlow 検証

**N:** 最後に — サブフローを使ってる。子フローが必要なデータを確実に取得できるようにするには？

**A:** `GuaranteedSubflowValidator` が設計時にチェックする:

```typescript
import { GuaranteedSubflowValidator } from '@unlaxer/tramli-plugins';

const validator = new GuaranteedSubflowValidator();
validator.validate(parentDef, 'PAYMENT_PENDING', childDef, new Set());
// childDef のエントリが PAYMENT_PENDING で利用不可能な型を必要とする場合、例外を投げる
```

実行時に親が注入するデータは `guaranteedTypes` で指定できる。

---

## 第11幕: 全部まとめて

**N:** OK、全部一つのフローで書いてみる。

**A:** こちらが完全な統合パターン:

```typescript
import { Tramli, InMemoryFlowStore, flowKey } from '@unlaxer/tramli';
import {
  PluginRegistry, PolicyLintPlugin,
  AuditStorePlugin, EventLogStorePlugin,
  ObservabilityEnginePlugin, InMemoryTelemetrySink,
  RichResumeRuntimePlugin, IdempotencyRuntimePlugin,
  InMemoryIdempotencyRegistry,
  DiagramPlugin, DocumentationPlugin, ScenarioTestPlugin,
} from '@unlaxer/tramli-plugins';

// 1. フローを定義（コア tramli）
const def = Tramli.define<OrderState>('order', stateConfig)
  .initiallyAvailable(OrderRequest)
  .from('CREATED').auto('PAYMENT_PENDING', orderInit)
  .from('PAYMENT_PENDING').external('PAYMENT_CONFIRMED', paymentGuard)
  .from('PAYMENT_CONFIRMED').auto('SHIPPED', ship)
  .onAnyError('CANCELLED')
  .build();

// 2. プラグインを登録
const sink = new InMemoryTelemetrySink();
const registry = new PluginRegistry<OrderState>();
registry
  .register(PolicyLintPlugin.defaults())
  .register(new AuditStorePlugin())
  .register(new EventLogStorePlugin())
  .register(new ObservabilityEnginePlugin(sink))
  .register(new RichResumeRuntimePlugin())
  .register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

// 3. Lint
const report = registry.analyzeAll(def);
if (report.findings().length > 0) console.warn(report.asText());

// 4. ラップされたStoreでエンジンを構築
const wrappedStore = registry.applyStorePlugins(new InMemoryFlowStore());
const engine = Tramli.engine(wrappedStore);
registry.installEnginePlugins(engine);

// 5. リッチAPIを取得
const adapters = registry.bindRuntimeAdapters(engine);
const resume = adapters.get('rich-resume');
const idempotent = adapters.get('idempotency');

// 6. ドキュメント生成
console.log(new DiagramPlugin().generate(def).mermaid);
console.log(new DocumentationPlugin().toMarkdown(def));
console.log(new ScenarioTestPlugin().generate(def).scenarios);

// 7. 実行！
const flow = await engine.startFlow(def, 'session-1', initialData);
```

**N:** これは...驚くほど綺麗だ。コアは50行、プラグインはオプションの層、フロー定義が唯一の真実の源。

**A:** それがアイデアだ。tramli = 軌道。プラグイン = 軌道沿いの駅。
