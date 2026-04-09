---
status: accepted
---

# DD-032: Issue #18-22 フィードバック + tramli-react

**Date:** 2026-04-09
**Issues:** #18, #19, #20, #21, #22, #15-S1

## Decision

### P0 — バグ修正

**D1: durationMicros 常時計測 (#21)**
- 条件分岐 `transitionLogger != null ? System.nanoTime() : 0` を除去
- 常時 `System.nanoTime()` / `Instant::now()` / `performance.now()` で計測
- 25ns のオーバーヘッドは遷移 2μs に対して 1.25%。不正確な値を返すより常時計測が正しい
- 3 言語修正

### P0 — パリティ

**D2: TelemetryEvent に flowName + durationMicros (#18)**
- Java: `TelemetryEvent` record に `flowName` + `durationMicros` フィールド追加
- Rust: `TelemetryEvent` struct に同上
- TS: v3.4.0 で対応済み (ObservabilityPlugin が flowName/durationMicros を含む)

### P1 — 品質

**D3: ObservabilityPlugin append mode (#19)**
- FlowEngine に `getTransitionLogger()` / `getErrorLogger()` / `getGuardLogger()` を追加 (3 言語)
- ObservabilityPlugin.install() に append オプション: 既存 logger を chain
- CompositeLogger ユーティリティはコード提供しない (3 行で書ける)

**D4: Java PluginRegistry 型パラメータ除去 (#20)**
- `PluginRegistry<S>` → `PluginRegistry`
- `analyzeAll()` は method-level generic `<S>` に変更
- store/engine plugin は FlowState 非依存なので影響なし
- TS/Rust は影響なし

**D5: FlowStore PostgreSQL ドキュメント (#22)**
- `docs/patterns/flowstore-schema.md` に PostgreSQL JDBC 注意点セクション追加

### P1 — 新パッケージ

**D6: @unlaxer/tramli-react (#15-S1)**
- 新パッケージ: `@unlaxer/tramli-react`
- React を peerDependency
- `useFlow` hook: engine/store シングルトン管理、flowId ref、状態同期、cleanup
- Zustand/Redux 非依存の minimal hook

### Close

- **#17**: v3.4.0 で externallyProvided + branch label 対応済み

## Rationale

- ハウス: durationMicros の条件分岐は "後から logger 設定" ケースを見落としたバグ
- ヤン: CompositeLogger はドキュメントで十分。append mode は install() 側で吸収
- リヴァイ: Java PluginRegistry<S> は analyzeAll のみの問題。method generic で解決
- tramli-react: React はフロントエンド TS ユーザーのデファクト。hook がないと毎回ボイラープレート
