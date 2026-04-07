# Feedback: volta-console への tramli-ts 導入

**日付:** 2026-04-07
**バージョン:** @unlaxer/tramli v1.5.3
**導入先:** volta-console backend (Node.js / Express / CJS)
**用途:** デプロイフローの状態遷移管理 (12 states, 9 transitions)
**レポーター:** Claude Opus 4.6 (volta-platform AI agent)

---

## 良かった点

### 1. `build()` 時のデータフロー検証が強力

`requires` / `produces` のデータフロー分析で、定義時に「このプロセッサに必要なデータが到達できない」を弾いてくれた。

実例: `initiallyAvailable()` を書き忘れた状態で `build()` を呼んだところ、9 個の具体的なエラーが即座に出た。

```
FlowError: Flow 'deploy' has 9 validation error(s):
  - Processor 'ProvisionDns' at PENDING -> PROVISIONING_DNS requires hostname but it may not be available
  - Processor 'Deploy' at BUILDING -> DEPLOYING requires serviceId but it may not be available
  ...
```

ランタイムで「context に serviceId がない」と落ちるより、定義時に全部検出できるのは開発体験として非常に良い。

### 2. 既存コードへの侵襲性が低い

既存の `provisioner.js` / `serviceManager.js` を **一切変更せず**、薄い StateProcessor ラッパーを書くだけで統合できた。

```js
const dnsProcessor = {
  name: 'ProvisionDns',
  requires: [HOSTNAME, SERVICE_URL],
  produces: [],
  async process(ctx) {
    await provisioner.cloudflareAdd(ctx.find(HOSTNAME), ctx.find(SERVICE_URL));
  },
};
```

これは導入障壁の低さとして重要。「全部書き直し」ではなく「既存コードをそのまま活かせる」。

### 3. CJS dual export (v1.5.3) は正解

volta-console backend は CommonJS。v1.5.3 の dual export 対応で `require('@unlaxer/tramli')` が普通に使え、dynamic import のラッパー層が完全に不要になった。既存の CJS プロジェクトへの導入障壁がほぼゼロ。

### 4. FlowStore interface のシンプルさ

`create` / `loadForUpdate` / `save` / `recordTransition` の 4 メソッドだけで、PostgreSQL FlowStore を約 90 行で実装できた。インターフェースが過不足なく設計されている。

---

## 気になった点 / 改善提案

### 1. `loadForUpdate` に definition を渡すシグネチャがない

FlowStore の `loadForUpdate(flowId)` は戻り値が `unknown` で、`FlowInstance.restore()` を呼ぶには definition が必要。しかし interface の型定義では definition をどう渡すかが見えない。

Java 版 (auth-proxy) では `loadForUpdate(flowId, definition)` と明示的だったが、TS 版ではストア側が definition を知る方法がない。

**実装時の対処:** `PgFlowStore.loadForUpdate(flowId, definition)` と独自に引数を追加した。

**提案:** interface に `loadForUpdate<S>(flowId: string, definition?: FlowDefinition<S>)` のオーバーロードを追加するか、ストアのコンストラクタで definition registry を受け取るパターンを公式にサポートする。

### 2. auto-chain が同期的に全部走りきる

`startFlow()` が PENDING → SUCCESS まで一気に走りきる。各 processor が async でも、chain 全体は await で直列実行。

長い処理（Cloudflare API 呼び出し等）がある場合:
- UI 側で socket.io の `deployment:transition` イベントを見ても一瞬で全部流れる
- HTTP レスポンスを返すのが全 processor 完了後になる

**考慮してほしいシナリオ:**
- 「処理中」を UI に見せたい場合、external transition で区切るか、processor 内で明示的にイベントを emit する必要がある
- `startFlow()` が最初の auto transition だけ実行して残りは background で進む、みたいなオプションがあると嬉しい（あるいは設計意図として「全部同期」で正しいなら、ドキュメントで明記してほしい）

### 3. エラー時のコンテキスト保存

processor が throw した時:
- context は backup から restore される（これは正しい）
- しかし、**エラーメッセージ自体は FlowContext に残らない**
- rollback processor 側で「何が失敗したか」を知る手段がない

**提案:** `onError` 遷移時に、エラー情報を自動的に context に注入するオプション。例:

```js
// エンジンが自動で ctx.put(flowKey('_error'), { message, stack, fromState }) してくれると嬉しい
.onError('PROVISIONING_PROXY', 'ROLLING_BACK_DNS', { captureError: true })
```

または `FlowInstance` に `lastError` プロパティを持たせる。

### 4. ドキュメント: FlowStore 実装ガイド

InMemoryFlowStore の実装は参考になるが、PostgreSQL / SQLite 等の永続ストア実装に必要な考慮事項（optimistic locking のパターン、context の serialize/deserialize、`FlowInstance.restore()` の引数順序）を公式ドキュメントとしてまとめてほしい。

特に `FlowInstance.restore()` の引数が 10 個あるので、一覧があると助かる:

```
restore(id, sessionId, definition, context, currentState, createdAt, expiresAt, guardFailureCount, version, exitState)
```

---

## 導入結果のサマリ

| 指標 | 値 |
|------|-----|
| 新規ファイル | 7 |
| 修正ファイル | 4 |
| 追加行数 | ~670 |
| FlowStore 実装行数 | ~90 |
| フロー定義行数 | ~50 |
| Processor 合計 | 8 (forward 5 + rollback 3) |
| 導入所要時間 | ~1 時間 |
| 既存コード変更 | provisioner.js に export 1 行追加のみ |

**総合評価:** 導入コストに対してリターンが大きい。特にロールバックチェーンの自動化と DB 永続化は、fire-and-forget + in-memory の世界と比べて明確に改善。Phase 2 (サービスライフサイクル) への拡張も計画している。
