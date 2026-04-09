---
status: accepted
---

# DD-034: Issue #23-24 トリアージ + #14 残件整理

**Date:** 2026-04-09
**Issues:** #23 (AskOS v3.5.0 feedback), #24 (volta-auth-proxy v3.5.0 feedback), #14 残件

## トリアージ

### #23 — AskOS フィードバック

**R1: MermaidGenerator error transition 除外オプション**
- 優先度: P1 — 小さい変更、ドキュメント用途で即効性
- 実装: `MermaidGenerator.generate(def, { excludeErrorTransitions: true })` (TS/Java/Rust)
- error transition ループ (L36-42) を options で制御

**R2: ScenarioTestPlugin テストコード生成**
- 優先度: P2 — 有用だが設計検討が必要
- 案: `generate(def, { framework: 'vitest' })` で実行可能テストコード出力
- schema-only モード（FlowEngine 不要）は別途検討
- v3.6.0 候補

**R3: Guard ボイラープレート削減**
- 優先度: P3 — 現行 API で十分機能する
- ファクトリや省略構文はゼロ依存ラムダ設計に反する
- close（WONTFIX）

### #24 — volta-auth-proxy フィードバック

**R4: FlowEngine.withPlugins() ファクトリ**
- 優先度: P2 — 便利だが 4 行が 1 行になるだけ
- PluginRegistry 自体が既に facade パターン
- close（PluginRegistry のドキュメント改善で対応）

**R5: FlowDefinition.analyzeWith(PluginRegistry)**
- 優先度: P2 — build() 後に自動 lint を走らせるショートカット
- 案: `Builder.withAnalysis(registry)` → build() 内で自動 analyzeAll()
- v3.6.0 候補

**R6: TelemetrySink.systemLogger() ビルトイン**
- 優先度: P1 — Java 限定だが 10 行のコード
- System.Logger は JDK ビルトインなのでゼロ依存原則に反しない
- java-plugins に `SystemLoggerTelemetrySink` を追加

### #14 残件

**S1: Builder.strict_mode** → P2、v3.6.0 候補
**S4: AuditingStore FlowStore trait (Rust)** → P2、Rust のみ
**S6: DiagramPlugin annotation** → P3、defer

## Decision — v3.5.1 実装対象

即実装（小さい + 高価値）:

| # | 内容 | 言語 | 工数 |
|---|------|------|------|
| R1 | MermaidGenerator excludeErrorTransitions | 3 言語 | S |
| R6 | SystemLoggerTelemetrySink | Java | S |

## v3.6.0 実装対象（全件実装済み）

| # | 内容 | 言語 | 状態 |
|---|------|------|------|
| R2 | ScenarioTestPlugin.generateCode() | TS | done |
| R5 | PluginRegistry.buildAndAnalyze() | TS/Java | done |
| S1 | Builder.strictMode() + FlowDefinition.strictMode | 3 言語 | done |
| S4 | FlowStore trait + AuditingStore impl | Rust | done |

## Closed

| # | 内容 | 理由 |
|---|------|------|
| R3 | Guard ボイラープレート削減 | ゼロ依存ラムダ設計に反する |
| R4 | FlowEngine.withPlugins() | PluginRegistry が既に facade |
| S6 | DiagramPlugin annotation | P3、defer |
