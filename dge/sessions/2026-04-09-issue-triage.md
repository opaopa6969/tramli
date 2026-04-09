# DGE Session: Issue #6-13 トリアージ

**Date:** 2026-04-09
**Flow:** quick
**Theme:** 7 Issue (plugin pack 成熟・ポート・ドキュメント) の優先順位と方針
**Characters:** ☕ ヤン, 👤 今泉, ⚔ リヴァイ, 🕵 右京

## 結論

| Issue | 判断 | 理由 |
|-------|------|------|
| #6 SPI 公式化 | 部分 close → ドキュメントのみ残す | acceptance criteria の大半は DD-022 + v3.3.0 で達成済み |
| #7 carta/tenure archive | やる (5分) | deprecation notice + Archive ボタン |
| #8 LCA ランタイム | 後回し (Low) | DD-021 Flat is Correct。ユースケース待ち |
| #9 javadoc | ドキュメント整備に統合 | 3 言語の doc comment を揃える |
| #11 TS/Rust ポート | close | DD-022 で 14 プラグイン 3 言語ポート完了済み |
| #12 shared-tests 昇格 | close | DD-028 で 30 シナリオ SharedSpec 完了済み |
| #13 日本語ドキュメント | ドキュメント整備に統合 | #6 残 + #9 + #13 を 1 タスクに |

## Gap 一覧

| # | Gap | Category | Severity |
|---|-----|----------|----------|
| 1 | #11 は DD-022 で解決済み | Spec-impl mismatch | High |
| 2 | #12 は DD-028 で解決済み | Spec-impl mismatch | High |
| 3 | #6 の残は docs のみ | Missing logic | Medium |
| 4 | carta/tenure の registry deprecation 確認 | Integration gap | Medium |
| 5 | #9 は 3 言語 doc comment を揃えるべき | Missing logic | Medium |
| 6 | #6+#9+#13 を統合すべき | Integration gap | Medium |
