# DGE Session: Issue #5 — volta-gateway 採用フィードバック対応

**Date:** 2026-04-09
**Flow:** quick
**Theme:** Issue #5 の改善要望 5 件の設計 Gap 洗い出し
**Characters:** ☕ ヤン, 🏥 ハウス, 👤 今泉, ⚔ リヴァイ, 🎩 千石

## Gap 一覧

| # | Gap | Category | Severity |
|---|-----|----------|----------|
| 1 | duration の計測範囲が未定義（遷移のみ vs processor 込み vs guard 込み） | Spec-impl mismatch | High |
| 2 | TransitionLogEntry だけでなく全 LogEntry に duration を入れるべき | Missing logic | High |
| 3 | duration 計測はロガー設定時のみ（ゼロコスト原則） | Missing logic | Medium |
| 4 | FindingLocation は遷移だけでなく状態・データ・フロー全体もカバーすべき | Missing logic | High |
| 5 | FindingLocation は flat struct ではなく enum/union 型にすべき | Spec-impl mismatch | Medium |
| 6 | 各 lint ポリシーが location を一貫して埋める実装規約が必要 | Integration gap | Medium |
| 7 | 現アーキテクチャでは TelemetrySink の Mutex contention は起きない | Spec-impl mismatch | High |
| 8 | 要望の本質は "I/O sink でエンジンをブロックしたくない" | Spec-impl mismatch | High |
| 9 | ChannelTelemetrySink を tramli-plugins に入れるかドキュメントかの判断 | Missing logic | Medium |
| 10 | channel 実装は言語/ランタイムごとに多様、tramli が 1 つ提供しても汎用性低い | Integration gap | Medium |
| 11 | async パターンは TelemetrySink だけでなく AuditingStore にも波及 | Integration gap | High |
| 12 | guard rejection path もシナリオ生成に含めるべき | Test coverage | Medium |
| 13 | error → compensation → resume の複合パスシナリオ生成 | Test coverage | Medium |
| 14 | 使用例は doc test/docstring として書くべき | Error quality | Low |

## Gap 詳細

### Gap-1: duration の計測範囲が未定義
- **Observe:** volta-gateway は "遷移ごとのレイテンシをログしたい" と言っているが、何を含む duration か不明
- **Suggest:** 明確に定義: TransitionLogEntry.duration = 遷移判定開始〜状態変更完了（processor/guard の実行時間込み）
- **Act:** 各 LogEntry 型の duration の計測範囲を仕様化

### Gap-2: 全 LogEntry に duration
- **Observe:** TransitionLogEntry だけに duration を入れると processor/guard のボトルネック特定ができない
- **Suggest:** TransitionLogEntry, ErrorLogEntry, GuardLogEntry, StateLogEntry 全てに durationNanos を追加
- **Act:** 4 つの LogEntry 型を 3 言語で更新

### Gap-3: ゼロコスト原則
- **Observe:** Instant::now() は ~20-30ns。ロガー未設定時にも呼ぶとオーバーヘッド
- **Suggest:** ロガーが設定されているときだけ計測開始。未設定時はゼロコスト
- **Act:** エンジン内部で `if self.transition_logger.is_some() { let start = Instant::now(); ... }` パターン

### Gap-4/5: FindingLocation の型設計
- **Observe:** 遷移ベースの location だけでは dead data（データノード）や状態単体の Finding に対応できない
- **Suggest:** enum/union 型で 4 variant: Transition(from, to), State(state), Data(dataKey), Flow
- **Act:** 3 言語の Finding に `location?: FindingLocation` (enum) を追加

### Gap-6: ポリシーの実装規約
- **Observe:** location の型を決めても、各ポリシーが一貫して埋める保証がない
- **Suggest:** PluginReport.add() に location パラメータを追加（optional）。lint ポリシーのテンプレートに location 記入を推奨
- **Act:** PluginReport API の更新 + 既存ポリシーの location 埋め込み

### Gap-7/8: async の本質
- **Observe:** FlowEngine が Mutex で包まれている限り、TelemetrySink の Mutex contention は理論上起きない
- **Suggest:** 要望の本質は "I/O を伴う sink (HTTP, gRPC) でエンジンをブロックしたくない"
- **Act:** ChannelTelemetrySink ではなく、"I/O sink の非ブロッキングパターン" としてドキュメント + example で対応

### Gap-9/10: channel の提供方法
- **Observe:** channel 実装は言語/ランタイムごとに選択肢が多い (mpsc, crossbeam, tokio::sync, BlockingQueue, etc.)
- **Suggest:** tramli-plugins に特定の channel 実装を入れない。docs に各言語の推奨パターンを example として記載
- **Act:** docs/patterns/non-blocking-sink.md を作成

### Gap-11: AuditingStore も同じ問題
- **Observe:** async の問題は TelemetrySink だけでなく AuditingStore.store() にも当てはまる
- **Suggest:** "I/O を伴うプラグインの非ブロッキングパターン" として横断的に設計
- **Act:** Gap-9/10 のドキュメントに AuditingStore のパターンも含める

### Gap-12/13: テストシナリオの拡張
- **Observe:** ScenarioTestPlugin は DD-026 以前に書かれ、error_transitions/exception_routes を知らない
- **Suggest:** error path + guard rejection + compensation の複合パスもシナリオ生成
- **Act:** ScenarioTestPlugin に error/guard/compensation シナリオ生成ロジック追加

### Gap-14: doc test
- **Observe:** README の使用例はコードと同期しない
- **Suggest:** Rust doc test, Java javadoc snippet, TS jsdoc example としてソースに記載
- **Act:** 実装完了後に各プラグインの doc comment に example 追加
