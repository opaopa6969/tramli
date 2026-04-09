# Session Handoff — 2026-04-09 R5

## 完了したこと

### v3.5.0 リリース — DD-033 (#19 chain mode + tramli-react テスト)

- D1: FlowEngine logger getters (TS/Java), take_* (Rust) — chain support
- D2: ObservabilityPlugin append mode — 既存 logger を chain (3 言語)
- D3: tramli-react テスト基盤 — vitest + @testing-library/react, 7 テスト
- D4: バージョン bump 3.5.0 + tramli-react 0.2.0
- 7 パッケージ publish (npm × 3, crates.io × 2, Maven Central × 2)

### v3.5.1 リリース — DD-034 (Issue #23-24 トリアージ)

- R1: MermaidGenerator excludeErrorTransitions オプション (3 言語)
- R6: SystemLoggerTelemetrySink — JDK System.Logger ベース (Java)
- DGE: #23/#24 トリアージ、R3/R4 close

### v3.6.0 リリース — DD-034 (残件全実装)

- S1: Builder.strictMode() — 定義レベルの strict mode (3 言語)
- S4: FlowStore trait + AuditingStore impl (Rust)
- R5: PluginRegistry.buildAndAnalyze(builder) (TS/Java)
- R2: ScenarioTestPlugin.generateCode() — vitest/jest テストコード生成 (TS)

### v3.6.1 リリース — DD-035 (Issue #15-17-25-26 トリアージ)

- PluginRegistry.analyzeAndValidate(def) — build 済み定義の lint + throw (TS/Java)
- NoopTelemetrySink — ベンチマーク baseline (3 言語)
- Tramli.data() — flowKey → Map 変換ヘルパー (TS)

### Issue 対応

| # | 内容 | 対応 |
|---|------|------|
| #14 | volta-gateway feedback 残り | S1/S4 実装、S6 close |
| #15 | volta-auth-console React | tramli-react 済、S2 → Tramli.data() |
| #17 | agent-log-broker | externallyProvided/branchLabel 済 |
| #19 | ObservabilityPlugin chain mode | getters + append 実装 |
| #23 | AskOS v3.5.0 feedback | excludeErrors/generateCode/strictMode |
| #24 | volta-auth-proxy v3.5.0 | SystemLogger/buildAndAnalyze |
| #25 | volta-auth-proxy v3.6.0 | analyzeAndValidate |
| #26 | volta-gateway v3.6.0 | NoopTelemetrySink, FlowStore trait |

### DGE セッション

- DD-033: #19 実装 + tramli-react テスト + v3.5.0
- DD-034: #23/#24 トリアージ → v3.5.1 + v3.6.0
- DD-035: #15/#17/#25/#26 トリアージ → v3.6.1

---

## テスト状況

| スイート | テスト数 | 状態 |
|---------|---------|------|
| TS core | 65 | passing |
| TS plugins | 24 | passing |
| tramli-react | 7 | passing |
| Java core | all | passing |
| Java plugins | all | passing |
| Rust core | 16 | passing |
| Rust plugins | 17 | passing |

---

## Open Issues (1 件)

| # | 内容 | 優先度 | 備考 |
|---|------|--------|------|
| #8 | hierarchy LCA ランタイム | Low | YAGNI。ユースケース待ち |

---

## 次セッション候補

1. **DD-027 tramli-viz** — リアルタイム監視デモ (前提条件は全て達成済み)
2. **各プロジェクトの tramli バージョンアップ** — volta-gateway/auth-proxy/AskOS/agent-log-broker を v3.6.1 に
3. **AsyncFlowStore パターンドキュメント** — #26-1 で要望あり。docs/patterns/async-store.md
4. **FlowStore::list_by_state** — #26-2 で要望。SqlFlowStore 実装時に再検討
5. **session handoff 自動生成** — DGE/DD の情報から handoff を自動構築

---

## 設計上の差異（許容済み）

| 差異 | 備考 |
|------|------|
| Rust withPlugin | SubFlowRunner で代替 |
| Rust sub-flow resume | SubFlowRunner パターン |
| FlowStore trait なし → あり (v3.6.0) | InMemoryFlowStore + AuditingStore が impl |
| Rust PluginRegistry なし | descriptor() + install() で個別管理 |
| ScenarioTestPlugin.generateCode() | TS のみ (Java/Rust はテストフレームワークが異なる) |

---

## パッケージ

| パッケージ | バージョン | レジストリ |
|-----------|-----------|-----------|
| @unlaxer/tramli | 3.6.1 | npm |
| @unlaxer/tramli-plugins | 3.6.1 | npm |
| @unlaxer/tramli-react | 0.2.0 | npm |
| tramli | 3.6.1 | crates.io |
| tramli-plugins | 3.6.1 | crates.io |
| org.unlaxer:tramli | 3.6.1 | Maven Central |
| org.unlaxer:tramli-plugins | 3.6.1 | Maven Central |
