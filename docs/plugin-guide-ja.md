[English version](plugin-guide.md)

# tramli プラグインガイド

tramli は**検証カーネル** — フラットなセマンティクス、`requires/produces`、ビルド時バリデーション。
それ以外はすべてプラグイン。

> **tramli はモノリシックなワークフローフレームワークではなく、
> 凍結された検証カーネルを囲むプラグインプラットフォームであるべき。**

## アーキテクチャ

```
┌─────────────────────────────────────────┐
│          プラグイン層                     │
│  audit · eventstore · observability     │
│  hierarchy · resume · lint · testing    │
│  diagram · docs · idempotency          │
├─────────────────────────────────────────┤
│          tramli コア (凍結)              │
│  FlowDefinition · FlowEngine           │
│  requires/produces · build() · 8検査    │
│  DataFlowGraph · Pipeline              │
└─────────────────────────────────────────┘
```

コアは `FlowDefinition` と `FlowEngine` の検証セマンティクスだけを担う。
監査、可観測性、テスト生成などは全てプラグイン層が担当し、
コアに手を入れずに機能を追加できる。

## プラグイン種別 (SPI)

| SPI | メソッド | 役割 | 例 |
|-----|----------|------|-----|
| `StorePlugin` | `wrapStore(FlowStore)` | 永続化をデコレート | AuditStorePlugin, EventLogStorePlugin |
| `EnginePlugin` | `install(FlowEngine)` | エンジンライフサイクルにフック | ObservabilityEnginePlugin |
| `RuntimeAdapterPlugin<R>` | `bind(FlowEngine)` → `R` | リッチなAPIでエンジンをラップ | RichResumePlugin, IdempotencyPlugin |
| `AnalysisPlugin<S>` | `analyze(FlowDefinition, PluginReport)` | 静的解析 | PolicyLintPlugin, SubflowValidator |
| `GenerationPlugin<I,O>` | `generate(I)` → `O` | コード/ドキュメント生成 | HierarchyPlugin, DiagramPlugin, ScenarioPlugin |
| `DocumentationPlugin<I>` | `generate(I)` → `String` | Markdown生成 | FlowDocumentationPlugin |

## プラグインレジストリ

```typescript
import {
  PluginRegistry, PolicyLintPlugin, AuditStorePlugin,
  EventLogStorePlugin, ObservabilityEnginePlugin, InMemoryTelemetrySink,
  InMemoryFlowStore, Tramli,
} from '@unlaxer/tramli-plugins';

const registry = new PluginRegistry<OrderState>();
const sink = new InMemoryTelemetrySink();

registry
  .register(PolicyLintPlugin.defaults())           // 解析
  .register(new AuditStorePlugin())                // ストアデコレータ
  .register(new EventLogStorePlugin())             // ストアデコレータ
  .register(new ObservabilityEnginePlugin(sink));   // エンジンフック

// 1. 解析
const report = registry.analyzeAll(definition);

// 2. ストアをラップ
const store = registry.applyStorePlugins(new InMemoryFlowStore());

// 3. エンジンフックを設置
const engine = Tramli.engine(store);
registry.installEnginePlugins(engine);

// 4. ランタイムアダプタをバインド
const adapters = registry.bindRuntimeAdapters(engine);
```

## プラグインの許可範囲

### できること (MAY)

- FlowStore をラップして監査/イベントログを追加
- FlowEngine のロガーコールバックにフック
- FlowDefinition をポリシー違反の観点で解析
- FlowDefinition からコード、図、ドキュメントを生成
- FlowEngine 上にリッチな resume/冪等性 API を提供

### できないこと (MAY NOT)

- tramli のビルド時バリデーションセマンティクスの変更
- requires/produces 検証のオーバーライド
- 直交領域 (orthogonal regions) のコアへの導入
- フルイベントソーシングのコアへの組み込み
- 補償 (compensation) をコアエンジンの責務にすること

## v1 プラグイン

### Audit

遷移と produced-data の差分をキャプチャする。FlowStore をラップ。

```typescript
registry.register(new AuditStorePlugin());
```

### Eventstore-lite (Tenure-lite)

追記専用の遷移ログ、リプレイ、`stateAtVersion`、補償。
**フル Tenure ではない** — 意図的に軽量。

```typescript
registry.register(new EventLogStorePlugin());
// 後からリプレイ:
const replay = new ReplayService();
const state = replay.stateAtVersion(events, flowId, version);
```

**注意**: `stateAtVersion()` は各イベントがフル状態スナップショットを含む前提。
差分のみの永続化に移行する場合、リプレイは fold/reducer に変更する必要がある。

### Observability

FlowEngine のロガーフックと統合し、設定可能なシンクに `TelemetryEvent` を送出する。

```typescript
registry.register(new ObservabilityEnginePlugin(new InMemoryTelemetrySink()));
```

#### durationMicros (v3.3.0)

`TransitionLogEntry`、`ErrorLogEntry`、`GuardLogEntry` にマイクロ秒精度の `durationMicros` フィールドが追加された。
遷移やガード評価にかかった時間を整数マイクロ秒で記録する。

```typescript
// TypeScript: performance.now() (ミリ秒) → マイクロ秒に変換
engine.transitionLogger = (entry) => {
  console.log(`${entry.from} → ${entry.to}: ${entry.durationMicros}μs`);
};

engine.guardLogger = (entry) => {
  if (entry.durationMicros > 10_000) {
    console.warn(`ガード ${entry.guardName} が遅い: ${entry.durationMicros}μs`);
  }
};
```

各言語での時刻取得:

| 言語 | API | 備考 |
|------|-----|------|
| TypeScript | `performance.now()` | ミリ秒 → `Math.round((end - start) * 1000)` でμsに |
| Java | `System.nanoTime()` | ナノ秒 → `(end - start) / 1000` でμsに |
| Rust | `Instant::now()` | `elapsed().as_micros()` でμsに |

#### Non-blocking sink パターン

本番環境で `TelemetrySink.emit()` が HTTP や gRPC 呼び出しを行う場合、
エンジンスレッドをブロックしないようチャネルで分離する。
詳細は [Non-Blocking Sink Pattern](patterns/non-blocking-sink.md) を参照。

```typescript
// 概要: emit() は同期のまま。キューに入れてバックグラウンドで送出。
class ChannelSink implements TelemetrySink {
  private queue: TelemetryEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 1024) { this.maxSize = maxSize; }

  emit(event: TelemetryEvent): void {
    if (this.queue.length >= this.maxSize) this.queue.shift(); // 古いものを破棄
    this.queue.push(event);
  }

  events(): readonly TelemetryEvent[] { return this.queue; }

  drain(): TelemetryEvent[] {
    return this.queue.splice(0);
  }
}

// setInterval で定期的に flush
setInterval(() => {
  const batch = sink.drain();
  if (batch.length) httpPost(batch);
}, 1000);
```

### Rich Resume

明示的なステータス分類付きの `resumeAndExecute`:
TRANSITIONED, ALREADY_COMPLETE, NO_APPLICABLE_TRANSITION, REJECTED, EXCEPTION_ROUTED.

```typescript
const executor = new RichResumeExecutor(engine);
const result = await executor.resume(flowId, def, data, currentState);
switch (result.status) {
  case 'TRANSITIONED':              // 新しい状態に遷移した
  case 'ALREADY_COMPLETE':          // フローは既に完了
  case 'NO_APPLICABLE_TRANSITION':  // 適用可能な遷移なし
  case 'REJECTED':                  // ガードが拒否
  case 'EXCEPTION_ROUTED':          // エラーがエラー状態にルーティングされた
}
```

### Idempotency

commandId 追跡による重複コマンドの抑制。

```typescript
const idempotent = new IdempotentRichResumeExecutor(engine,
  new InMemoryIdempotencyRegistry());

idempotent.resume(flowId, def,
  { commandId: 'cmd-1', externalData: new Map() }, state);
```

### Hierarchy Generation

階層的な状態仕様をフラットな tramli enum + ビルダスケルトンにコンパイルする。
階層は**オーサリング時の便宜だけ** — ランタイムは常にフラット。

```typescript
const gen = new HierarchyCodeGenerator();
console.log(gen.generateStateConfig(hierarchicalSpec));
console.log(gen.generateBuilderSkeleton(hierarchicalSpec));
```

### Lint / Policy

FlowDefinition に対する静的解析。設計ポリシーへの違反を検出する。

```typescript
registry.register(PolicyLintPlugin.defaults());
```

#### FindingLocation (v3.3.0)

Lint の検出結果に `location` フィールドが追加された。
問題がフロー定義のどこにあるかを構造的に特定できる。

```typescript
type FindingLocation =
  | { type: 'transition'; fromState: string; toState: string }
  | { type: 'state'; state: string }
  | { type: 'data'; dataKey: string }
  | { type: 'flow' };
```

`PluginReport` には位置付きで検出結果を追加する `warnAt()` / `errorAt()` が追加された:

```typescript
// カスタムポリシーで位置情報付き警告を出す
const customPolicy = (def: FlowDefinition<string>, report: PluginReport) => {
  for (const state of def.terminalStates) {
    if (def.transitionsFrom(state).length > 0) {
      report.warnAt(
        'my-policy/terminal-outgoing',
        `終端状態 ${state} に出力遷移があります`,
        { type: 'state', state },
      );
    }
  }
};

// 結果表示 — location が自動整形される
const report = new PluginReport();
lint.analyze(definition, report);
for (const finding of report.findings()) {
  // location が付いている場合: "[WARN] my-policy/terminal-outgoing: ... @ state(DONE)"
  console.warn(report.asText());
}
```

従来の `warn()` / `error()` も引き続き使える。位置情報はオプショナル。

### Diagram / Docs / Testing

FlowDefinition から Mermaid 図、Markdown ドキュメント、テストシナリオを生成する。

```typescript
new DiagramPlugin().generate(definition);          // Mermaid + データフロー + 概要
new DocumentationPlugin().toMarkdown(definition);   // Markdown フローカタログ
new ScenarioTestPlugin().generate(definition);      // BDDシナリオ
```

#### ScenarioKind (v3.3.0)

`ScenarioTestPlugin` はハッピーパスだけでなく、
エラー遷移、ガード拒否、タイムアウトのシナリオも自動生成する。
各 `FlowScenario` に `kind` フィールドが追加された:

```typescript
type ScenarioKind = 'happy' | 'error' | 'guard_rejection' | 'timeout';

interface FlowScenario {
  name: string;
  kind: ScenarioKind;
  steps: string[];
}
```

生成例:

```typescript
const plan = new ScenarioTestPlugin().generate(definition);

for (const scenario of plan.scenarios) {
  console.log(`[${scenario.kind}] ${scenario.name}`);
  scenario.steps.forEach(s => console.log(`  ${s}`));
}
// 出力:
//   [happy] CREATED_to_PENDING
//     given flow in CREATED
//     when auto processor OrderInit runs
//     then flow reaches PENDING
//
//   [error] error_PENDING_to_CANCELLED
//     given flow in PENDING
//     when processor throws an error
//     then flow transitions to CANCELLED via on_error
//
//   [guard_rejection] guard_reject_PENDING_paymentGuard
//     given flow in PENDING
//     when guard paymentGuard rejects 3 times
//     then flow transitions to CANCELLED via error
//
//   [timeout] timeout_PENDING
//     given flow in PENDING
//     when per-state timeout of 30000ms expires
//     then flow completes as EXPIRED
```

`kind` でフィルタすれば、テストスイートを性質ごとに分割できる:

```typescript
const errorScenarios = plan.scenarios.filter(s => s.kind === 'error');
const guardScenarios = plan.scenarios.filter(s => s.kind === 'guard_rejection');
```
