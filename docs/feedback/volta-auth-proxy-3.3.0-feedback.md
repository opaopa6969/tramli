# Feedback: volta-auth-proxy tramli 3.3.0 + plugins 3.3.0

> Date: 2026-04-09
> Project: volta-auth-proxy
> Upgrade path: 1.2.2 → 1.15.0 → 1.16.0 → 3.2.0 → 3.3.0 (4 days)

---

## 総合評価: 素晴らしい

4日間で5回のメジャー/マイナーアップグレードを経験した。**全てコード変更最小限で全テスト通過**。本番の認証ループ障害の調査・修正を tramli の新機能が直接支援した。ライブラリとしての安定性と進化速度のバランスが良い。

---

## v3.3.0 durationMicros — 即座に採用、即座に効果

### 良かった点

遷移ごとのマイクロ秒計測が Logger API に自然に統合された。既存のログフォーマットに `{5}μs` を追加するだけで、各 Processor / Guard の処理時間が可視化される。

```
[transition] oidc flow=abc INIT→REDIRECTED trigger=OidcInitProcessor 342μs
[guard] oidc flow=abc REDIRECTED guard=OidcCallbackGuard Accepted 1205μs
```

本番で「どの Processor が遅いか」がログだけで分かる。外部 APM ツールなしで P99 分析ができる。

### 改善提案

`durationMicros` が `0` になるケース: `transitionLogger == null` のとき `startNanos = 0` が渡されて、後から logger を設定すると最初の数遷移で不正確な値が出る可能性。logger 設定有無に関わらず常に計測して、logger がなければ捨てるほうが安全。コストは `System.nanoTime()` 1回（~25ns）で無視できる。

---

## v3.2.0 Plugin System — 設計は良い、型が惜しい

### 良かった点

- **AuditStorePlugin**: `wrapStore()` の decorator パターンが美しい。1行追加で監査機能が入る
- **PolicyLintPlugin.defaults()**: ゼロ設定でデザインチェックが走る
- **PluginRegistry.applyStorePlugins()**: store chain を自動管理

### 改善提案（3件、前回 issue に記載済み + 追加1件）

**Issue 1: ObservabilityPlugin が Logger API を上書きする**（前回報告済み）
→ v3.3.0 で未対応。現状は ObservabilityPlugin を使わず手動 logger で回避。

**Issue 2: TelemetryEvent に flowName と durationMicros がない**（前回報告済み + 追加）
→ v3.3.0 の LogEntry には `durationMicros` が入ったが、ObservabilityPlugin の TelemetryEvent にはまだない。

```java
// 現状の TelemetryEvent
record TelemetryEvent(String type, Instant timestamp, String flowId, String message) {}

// 理想
record TelemetryEvent(String type, Instant timestamp, String flowId, String flowName,
                      String message, long durationMicros) {}
```

**Issue 3: PluginRegistry<S> の型パラメータ問題**（前回報告済み）
→ v3.3.0 で未対応。`@SuppressWarnings("unchecked")` で回避中。

**Issue 4（新規）: ObservabilityPlugin と手動 Logger の共存**

ObservabilityPlugin を使いたいが durationMicros も欲しい。現状は二者択一。`ObservabilityPlugin` が `durationMicros` を TelemetryEvent に含めるか、手動 logger と chain できれば解決する。

---

## v1.16.0 FlowException 種別 — 即座に活用

### 良かった点

`FLOW_NOT_FOUND` / `FLOW_ALREADY_COMPLETED` / `FLOW_EXPIRED` の区別は本番障害の直接的な解決策になった。MFA フローで「期限切れなら新規作成、完了済みならリダイレクト」を明確に分岐できる。

```java
catch (FlowException fe) {
    String msg = switch (fe.code()) {
        case "FLOW_ALREADY_COMPLETED" -> "MFA session already used.";
        case "FLOW_EXPIRED" -> "MFA session expired.";
        default -> "MFA session not found.";
    };
}
```

### フィードバック → 翌日対応 → 即採用のサイクル

```
Day 1: フィードバック書く（docs/feedback/volta-auth-proxy-2026-04-08.md）
       リクエスト: FlowException 種別, LogEntry.flowName, loadCompleted
Day 2: tramli v1.16.0 リリース → 3件全て対応済み → volta-auth-proxy で即採用
Day 2: v3.2.0 plugin system → 即採用 + 新たに3件の issue 報告
Day 2: v3.3.0 durationMicros → 即採用
```

このフィードバックループの速さはオープンソースライブラリとして理想的。

---

## 本番障害での tramli 機能の貢献度

| 機能 | 障害での貢献 |
|------|------------|
| Logger API (v1.9.0) | 手動ログ 30 行を 3 行に。障害調査の初動が大幅短縮 |
| strictMode (v1.7.0) | produces 漏れを検出（MFA verify の特定パス） |
| warnings() (v1.12.0) | 起動時に設計リスクを検出 |
| lastError() (v1.6.0) | 「なぜフローが失敗したか」の診断 |
| FlowException 種別 (v1.16.0) | MFA flow expired vs completed の分岐 |
| flowName in LogEntry (v1.16.0) | 「OIDC か MFA か」のログフィルタリング |
| durationMicros (v3.3.0) | Processor 性能の可視化 |
| AuditStorePlugin (v3.2.0) | 遷移の自動監査記録 |
| PolicyLintPlugin (v3.2.0) | デフォルトポリシーによる設計チェック |

---

## 未採用だが興味のある機能

| 機能 | 理由 | 今後の見通し |
|------|------|------------|
| Pipeline API | 認証フローでは不要 | バッチ処理で検討 |
| onStepError | 例外型ルーティング | 次回のエラー処理改善で |
| SubFlow | MFA は sequential flow | フロー統合（AUTH-010）で検討 |
| RichResumeExecutor | resume の詳細結果 | MFA リトライ改善で |
| IdempotencyPlugin | 冪等 resume | 本番の重複リクエスト対策で |
| EventLogStorePlugin | イベントソーシング | 将来の監査要件で |
| ScenarioTestPlugin | YAML テストシナリオ | CI テスト強化で |

---

## 要望まとめ（優先度順）

1. **TelemetryEvent に flowName + durationMicros を追加** — ObservabilityPlugin が Logger API と同等の情報を出せるように
2. **ObservabilityPlugin の chain mode** — 手動 logger と共存可能に
3. **PluginRegistry の型パラメータ解消** — 複数 FlowState enum で1つの registry を使えるように
4. **durationMicros の常時計測** — logger 有無に関わらず `System.nanoTime()` を取る

---

## 環境

- Java 21 + Javalin 6.7
- PostgreSQL 16 (JSONB FlowContext, SELECT FOR UPDATE)
- Redis (sessions)
- Cloudflare Tunnel → Traefik → volta-auth-proxy
- 4 flows: OIDC (9 states), Passkey (6), MFA (4), Invite (6)
- 90 tests, all passing
