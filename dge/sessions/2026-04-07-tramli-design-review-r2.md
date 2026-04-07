**Decisions:** [DD-001](../decisions/DD-001-ttl-semantics.md)

# DGE Session: tramli 設計レビュー — Round 2 (自動反復)

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (auto-iterate round 2/5)
- **Pattern**: protocol-design + escalation-chain
- **Characters**: ☕ ヤン, 👤 今泉, 🎩 千石, ⚔ リヴァイ, 😰 僕
- **Focus**: Round 1 の C/H Gap 7件の解決策探索

## 解決策まとめ

### v0.1.0 コード修正 (3件)

#### Gap #3 + #4: processor 例外ハンドリング + External 実行順序統一
- processor 実行前に `ctx.snapshot()` でバックアップ
- FlowContext に `restoreFrom(Map)` メソッド追加
- 例外時は restore + handleError(error transition へ)
- External 遷移: transitionTo を processor 実行の **後** に移動（Auto と統一）
- executeAutoChain: try-catch で processor を囲み、失敗時は chain 中断 + handleError

#### Gap #7: auto+external 混在検出
- `checkAutoExternalConflict()` を 9番目のバリデーションとして追加
- 同一ステートに auto/branch と external が共存する場合にビルドエラー

### v0.1.0 文書化 (3件)

#### Gap #1 + #2: FlowStore 契約明記
- FlowStore Javadoc にスレッディング（single-threaded per flow）、アトミシティ（logical unit, save is authoritative）、バージョン（optimistic locking support）を明記

#### Gap #5: TTL セマンティクス
- 「TTL = external resume の有効期限」と決定
- auto-chain 中は TTL チェックしない（プロセッサは高速であること）
- GuardOutput.Expired は guard 独自の期限切れで FlowInstance TTL とは独立
- StateProcessor 契約: 「高速であること、外部 I/O を含むべきではない」

### v0.2.0 先送り (1件)

#### Gap #6: フロー定義バージョニング
- FlowInstance にバージョン情報を持たせ、resume 時に互換性チェック

## 新規 Gap

- **v0.1.0 スコープ定義の欠如** (Low) — リリース対象と利用者像が未定義
