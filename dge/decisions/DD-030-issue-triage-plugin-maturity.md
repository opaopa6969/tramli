---
status: accepted
---

# DD-030: Issue #6-13 トリアージ — plugin pack 成熟方針

**Date:** 2026-04-09
**Session:** [DGE Issue Triage](../sessions/2026-04-09-issue-triage.md)

## Decision

7 件の Issue を以下のように処理する。

### Close (解決済み)
- **#11** (TS/Rust ポート方針) — DD-022 で 14 プラグイン 3 言語ポート完了済み。新 plugin 追加時の言語順序ポリシーは DD-030 で明文化
- **#12** (shared-tests 昇格) — DD-028 で core S01-S30 完了。plugin integration のシナリオ共有は将来課題として残す

### アクション実行
- **#7** (carta/tenure archive) — deprecation notice + Archive 設定。tramli docs 内の関連リンクも棚卸し
- **#6+#9+#13** → 統合タスク「プラグインドキュメント整備」:
  1. 英語版 plugin-guide/tutorial を v3.3.0 に更新
  2. 3 言語の eventstore doc comment を揃える (#9)
  3. 日本語版 plugin-guide-ja/tutorial-plugins-ja を作成 (#13)
  4. plugin author guidance を追加 (#6 残)
  5. semantic stability テスト 1 件追加（plugin 有無で validator 結果同一を証明）

### 後回し
- **#8** (LCA ランタイム) — DD-021 Flat is Correct。ユースケースが出てから着手

## 新 plugin 追加ポリシー

新 plugin 追加時は **Java → TS → Rust** の順で実装する（DD-022 の実績に基づく）。
3 言語同時リリースは義務ではないが、リリース時点で 3 言語が揃っていることを推奨。

## Rationale

- ハウス診断: #11, #12 は "解決済み" に見えるが、新 plugin ポリシーと plugin テストシナリオ共有は未対応
- 千石基準: 英語版を v3.3.0 に合わせてから日本語版。古い情報の翻訳は品質違反
- ハウス診断: semantic stability テストは "当たり前" を保証するために必要。1 件で十分
