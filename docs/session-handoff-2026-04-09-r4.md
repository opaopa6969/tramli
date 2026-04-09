# Session Handoff — 2026-04-09 R4

## 完了したこと

### v3.3.0 リリース — DD-029 Issue #5 volta-gateway フィードバック対応

- D1: LogEntry に durationMicros 追加 (3 言語、performance.now/nanoTime/Instant)
- D2: Finding に FindingLocation enum 追加 (Transition/State/Data/Flow)
- D3: TelemetrySink async → docs/patterns/non-blocking-sink.md で対応
- D4: ScenarioTestPlugin にエラーパス生成 (error/guard_rejection/timeout)
- 6 パッケージ npm + crates.io + Maven Central publish

### v3.4.0 リリース — DD-031 4 プロジェクトフィードバック対応

- D1: externallyProvided() — Builder + DataFlowGraph + validation (3 言語)
- D2: branch label processor — Transition.branchLabel + Engine マッチ修正 (3 言語)
- D3: ObservabilityPlugin に guardLogger hook 追加 (Rust, TS)
- D4: README multi-external 記述更新
- D5: allowPerpetual ドキュメント可視性改善
- 6 パッケージ publish

### DD-032 Issue #18-22 対応

- D1: durationMicros 常時計測 (bug fix — 条件分岐除去)
- D2: Java/Rust TelemetryEvent に flowName + durationMicros フィールド追加
- D4: Java PluginRegistry<S> → PluginRegistry (型パラメータ除去)
- D5: FlowStore PostgreSQL JDBC ドキュメント追加
- D6: @unlaxer/tramli-react v0.1.0 — useFlow hook (npm publish)

### DD-030 Issue トリアージ

- #11 (TS/Rust ポート) close — DD-022 で完了済み
- #12 (shared-tests) close — DD-028 で完了済み
- #7 carta/tenure archived
- #6 SPI 公式化 → semantic stability テスト追加で close
- #9, #13 ドキュメント整備で close

### DGE セッション

- 7 Round 実施 (Issue #5 × 3, triage × 2, feedback × 2)
- auto_merge 1 回 (素の LLM レビュー併用)
- 新 plugin ポリシー明文化 (Java → TS → Rust 順)

---

## テスト状況

| スイート | テスト数 | 状態 |
|---------|---------|------|
| Java (core + plugins) | 100 | passing |
| TS (core + plugins) | 86 | passing |
| Rust (core + plugins) | 55+ | passing |

---

## DD 記録

| DD | 内容 | 状態 |
|----|------|------|
| DD-029 | Issue #5 volta-gateway フィードバック | accepted |
| DD-030 | Issue #6-13 トリアージ | accepted |
| DD-031 | 4 プロジェクトフィードバック (#14-17) | accepted |
| DD-032 | Issue #18-22 + tramli-react | accepted |

---

## Open Issues (3 件)

| # | 内容 | 優先度 | 備考 |
|---|------|--------|------|
| #8 | hierarchy LCA ランタイム | Low | YAGNI。ユースケース待ち |
| #14 | volta-gateway feedback 残り | P2 | Builder.strict_mode, AuditingStore FlowStore trait, DiagramPlugin annotation |
| #19 | ObservabilityPlugin chain mode | Medium | getLogger() API が前提。FlowEngine に getter 追加必要 |

---

## 次セッション候補

1. **#19 chain mode** — FlowEngine に getLogger() 追加 → ObservabilityPlugin append mode
2. **v3.5.0 publish** — #19 + durationMicros bug fix を含める
3. **DD-027 tramli-viz** — リアルタイム監視デモ (前提条件は全て達成済み)
4. **tramli-react テスト** — vitest + @testing-library/react でテスト追加
5. **各プロジェクトの tramli バージョンアップ** — volta-gateway/auth-proxy/AskOS/agent-log-broker を v3.4.0 に

---

## 設計上の差異（許容済み）

| 差異 | 備考 |
|------|------|
| Rust withPlugin | SubFlowRunner で代替 |
| Rust sub-flow resume | SubFlowRunner パターン |
| FlowStore trait なし (Rust) | InMemoryFlowStore 直接。trait 化は v4 検討 |

---

## 新パッケージ

| パッケージ | バージョン | レジストリ |
|-----------|-----------|-----------|
| @unlaxer/tramli | 3.4.0 | npm |
| @unlaxer/tramli-plugins | 3.4.0 | npm |
| @unlaxer/tramli-react | 0.1.0 | npm |
| tramli | 3.4.0 | crates.io |
| tramli-plugins | 3.4.0 | crates.io |
| org.unlaxer:tramli | 3.4.0 | Maven Central |
| org.unlaxer:tramli-plugins | 3.4.0 | Maven Central |

---

## Memory に記録した教訓

- ドキュメントは日本語先 → 英語翻訳 (両言語の質が上がる)
