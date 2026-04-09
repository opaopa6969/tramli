---
status: accepted
---

# DD-029: Issue #5 volta-gateway 採用フィードバック対応

**Date:** 2026-04-09
**Session:** [DGE Issue #5](../sessions/2026-04-09-issue5-volta-feedback.md)
**Issue:** #5

## Decision

volta-gateway の採用フィードバック 5 件に対して以下の方針で対応する。

### D1: LogEntry に duration 追加
- TransitionLogEntry, ErrorLogEntry, GuardLogEntry に `durationMicros` を追加（3 言語統一、整数マイクロ秒）
- StateLogEntry には追加しない（計測価値なし）
- 計測範囲: トリガー開始〜log 呼び出し直前
- ロガー未設定時はゼロコスト（Instant::now() を呼ばない）
- TS: `performance.now()` を使用（`Date.now()` はミリ秒精度で ~2μs 遷移を計測不可）
- Rust: `Instant::now()`, `duration.as_micros() as u64`
- Java: `System.nanoTime()`, `(end - start) / 1000`
- Java `LogEntry.Transition` record: 末尾にフィールド追加。ユーザーはアクセサで受け取るのみ（new しない）のためアクセサ互換。CHANGELOG に明記

### D2: Finding に FindingLocation 追加
- enum/union 型で 4 variant: Transition(from, to), State(state), Data(dataKey), Flow
- PluginReport.add() に optional location 引数を追加（後方互換）
- 3 言語: Java sealed interface, TS discriminated union, Rust enum

### D3: TelemetrySink — emit() は sync のまま
- emit() のシグネチャは変更しない（DD-012/DD-013 遵守）
- ChannelTelemetrySink は tramli-plugins にコード提供しない（言語ごとに選択肢が異なり汎用性が低い）
- `docs/patterns/non-blocking-sink.md` を作成し、TelemetrySink + AuditingStore の非ブロッキングパターンを各言語の example 付きで記載（backpressure ポリシー: bounded channel + drop-oldest を推奨）
- Issue #5 に設計理由をコメント

### D4: ScenarioTestPlugin にエラーパス生成追加
- error_transitions, exception_routes からエラーシナリオを生成
- guard rejection path も生成
- compensation → resume の複合パスも生成
- TTL/timeout expiry シナリオも生成
- FlowScenario に `kind` フィールド追加: happy / error / guard_rejection / timeout

### D5: API ドキュメント改善
- 使用例は doc test/docstring として記載（README ではなくソースに同期保証）

## Versioning
- v3.3.0 (minor) — 公開 API に型変更あり
- SharedSpec に S31-S33 を追加

## Rationale

- D1: ハウス診断 — duration が欲しいのではなくボトルネック特定がしたい。全 log 型に入れることで内訳が見える
- D2: 右京検証 — 全 lint ポリシーが 4 variant でカバーされることを確認
- D3: ハウス診断 — FlowEngine が Mutex で包まれている限り TelemetrySink の Mutex contention は理論上起きない。要望の本質は将来の I/O sink 対応。ドキュメントで十分
- D4: 今泉指摘 — ScenarioTestPlugin は DD-026 以前に書かれ、エラーパスの存在を知らない
- D5: 千石基準 — README は腐る。doc test はコンパイル時検証
