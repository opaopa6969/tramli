# API Stability Tiers

tramli をアプリケーションに組み込む方や、バージョン更新を判断する方に向けた文書です。
公開 API を3段階に分け、どの範囲なら互換性を維持した更新を期待できるかを説明します。
利用中の API の一覧と、独自にフローを保存・復元する場合の移行上の注意を確認できます。

## 依存する API の選び方

ライブラリを更新したときに、メソッドの引数が変われば呼び出し側の修正が必要になります。一方、新しいメソッドやフィールドの追加なら、既存の呼び出し方を維持できる場合があります。tramli の Tier は、こうした変更をどのバージョンで行うかを示す分類です。

| 分類 | 更新時に期待できること | 利用者が確認すること |
|------|------------------------|----------------------|
| **Tier 1 — Stable** | Minor 更新では破壊的変更をしません。破壊的変更は Major 更新で行います。 | 基本のフロー定義・実行処理は、この分類の API に依存できます。Major 更新時には移行内容を確認します。 |
| **Tier 2 — Evolving** | 既存メソッドのシグネチャを維持しながら、Minor 更新でメソッドやフィールドを追加することがあります。 | 独自のプラグインやログ処理を実装している場合は、追加された項目を確認します。 |
| **Tier 3 — Experimental** | Patch 更新でも API が変わる可能性があります。 | 更新のたびに差分を確認し、その API を使う箇所をテストします。 |

安定性は、公開 API の互換性についての方針です。たとえば、保存するフィールドが増えた場合には、呼び出し方が変わらなくても独自ストア側の対応が必要です。[移行メモ](#migration-notes)にその例を示します。

## Tier 1 — Stable

**Minor バージョンで破壊的変更をしない API です。** フローを定義し、実行し、データを渡す基本の処理が含まれます。

表の API 名は概念ごとの一覧です。言語による呼び方の違いは[言語ガイド](language-guide-ja.md#api-比較)を参照してください。TS は TypeScript を指します。

| API | 言語 |
|-----|------|
| `FlowDefinition` / `Builder` | TS/Java/Rust |
| `FlowEngine` (start/resume/loggers) | TS/Java/Rust |
| `FlowState` / `StateConfig` | TS/Java/Rust |
| `StateProcessor` / `TransitionGuard` / `BranchProcessor` | TS/Java/Rust |
| `FlowContext` (get/put/has/find) | TS/Java/Rust |
| `FlowInstance` | TS/Java/Rust |
| `InMemoryFlowStore` | TS/Java/Rust |
| `FlowStore` trait | Rust |
| `FlowError` / `FlowException` | TS/Java/Rust |
| `MermaidGenerator` | TS/Java/Rust |
| `flowKey` / `FlowKey` | TS |
| `Tramli` (define/engine/data) | TS |

## Tier 2 — Evolving

**Minor バージョンで追加・拡張する API です。** 既存メソッドのシグネチャ、つまり引数と戻り値の型は維持しますが、新しいメソッドやフィールドが加わることがあります。

| API | 言語 |
|-----|------|
| Logger API (`TransitionLogEntry` 等) | TS/Java/Rust |
| Plugin API (`PluginRegistry`, `EnginePlugin` 等) | TS/Java |
| `DataFlowGraph` | TS/Java/Rust |
| `ObservabilityPlugin` / `TelemetrySink` | TS/Java/Rust |
| `useFlow` hook | TS (tramli-react) |

`FlowEngine` にロガーを登録する API は Tier 1、ロガーに渡されるログ項目などの API は Tier 2 です。ログ処理を独自に実装する場合は、両方を確認してください。

## Tier 3 — Experimental

**Patch バージョンでも変更しうる API です。** 利用者のフィードバックを受けて設計を調整するため、互換性を維持できない変更もありえます。

| API | 言語 |
|-----|------|
| Pipeline API | TS |
| Hierarchy plugin (`EntryExitCompiler` 等) | TS/Java |
| EventStore plugin (replay/projection) | TS/Java/Rust |
| `ScenarioTestPlugin.generateCode()` | TS |
| `SkeletonGenerator` | TS |

これらを使う場合は、アプリケーション内の限られた箇所から呼び出すと、更新時に修正する範囲を確認しやすくなります。

## バージョニングポリシー

バージョン番号は `Major.Minor.Patch` の順です。各桁を更新する条件は次のとおりです。

| 更新する桁 | 表記例 | 変更内容 |
|------------|--------|----------|
| **Major** | `x.0.0` | Tier 1 API の破壊的変更時のみ |
| **Minor** | `3.x.0` | Tier 2 API の追加・変更、新機能。既存メソッドのシグネチャは維持 |
| **Patch** | `3.6.x` | バグ修正、Tier 3 API の変更、ドキュメント |

`3.x.0` と `3.6.x` は更新する桁を示す例であり、最新バージョンを示すものではありません。

## Migration notes

### v1.15.0 — per-state timeout

v1.15.0 で、`FlowInstance` に「現在の状態に入った時刻」を表す `stateEnteredAt` が加わりました。状態が遷移すると自動で更新され、状態ごとのタイムアウトを判定するために使います。

| 言語 | アクセサ | 型 |
|------|----------|----|
| Java | `FlowInstance.stateEnteredAt()` | `Instant` |
| TypeScript | `FlowInstance.stateEnteredAt` | `Date` |

独自の `FlowStore` でフローを保存・復元する場合は、この時刻の保存と復元も考慮してください。たとえば、支払い待ちに入ってからどれだけ経ったかを判定するには、フローの作成時刻とは別に、その状態に入った時刻が必要です。

復元時の扱いは実装によって異なります。現在の Java の [`FlowInstance.restore`](../lang/java/src/main/java/org/unlaxer/tramli/FlowInstance.java) は作成時刻を初期値にするため、本来より早く期限切れになる場合があります。TypeScript の [`FlowInstance.restore`](../lang/ts/src/flow-instance.ts) は復元時点の時刻を使うため、逆に待機時間が短く計算される場合があります。いずれの公開 `restore` メソッドも `stateEnteredAt` を引数に取らないので、フィールドを保存するだけで元の待機時間が復元されるとは限りません。

状態ごとのタイムアウトを使う独自ストアでは、復元後も元の状態開始時刻に基づいて判定できるかを確認してください。
