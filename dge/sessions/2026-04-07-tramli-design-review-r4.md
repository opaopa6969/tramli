# DGE Session: tramli 設計レビュー — Round 4 (自動反復)

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (auto-iterate round 4/5)
- **Pattern**: protocol-design + phase-minimization
- **Characters**: ☕ ヤン, 👤 今泉, 🕵 右京, ⚔ リヴァイ, 🎩 千石
- **Focus**: #12 解決策確定 + Medium 掃討 + コードレビュー指摘拾い上げ

## 解決策確定

### Gap #12: FlowInstance 再構築不能 (High → 解決)
- `FlowInstance.restore()` public static factory を追加
- 全フィールドコンストラクタはパッケージプライベート
- 既存コンストラクタは変更なし
- Javadoc: 「FlowStore 実装者が永続化から復元するために使用」

### コードレビュー指摘 #1: checkRequiresProduces visited 共有問題
- intersection ベースの合流点処理
- visited を `Map<S, Set<Class<?>>>` に置き換え
- 合流時は available の intersection を取る
- DAG 保証によりパス爆発なし、収束保証あり

### Gap #8: 例外カタログ
- FlowEngine class-level Javadoc にメソッド別例外リスト追加

### Gap #10: FlowContext Class キー制約
- FlowContext Javadoc + README に「専用 record 型をキーに使え」記載

### Gap #16: 異常系テスト不足
- FlowEngineErrorTest として 7 テストケースを追加
  1. processorThrows_routesToErrorState
  2. processorThrows_contextIsRestored
  3. branchReturnsUnknownLabel_routesToErrorState
  4. maxChainDepthExceeded_throwsFlowException
  5. ttlExpired_resumeCompletesAsExpired
  6. guardRejectedMaxRetries_routesToErrorState
  7. autoAndExternalConflict_buildFails

### Gap #17: Getting Started 欠如
- README にクイックスタートセクション追加（実装タスク）

### Gap #18: FlowContext シリアライゼーション指針
- FlowStore Javadoc に永続化ガイダンス追加

## v0.1.0 実装タスク総まとめ（Round 1-4 の全解決策）

### コード修正 (5件)
1. processor 例外 → snapshot/restore + handleError (Gap #3, #4)
2. External 遷移の実行順序を process→transition に統一 (Gap #4)
3. checkAutoExternalConflict バリデーション追加 (Gap #7)
4. FlowInstance.restore() factory 追加 (Gap #12)
5. checkRequiresProduces を intersection 方式に修正 (コードレビュー #1)
6. TransitionRecord に timestamp 追加 (Gap #9)

### テスト追加 (1件)
7. FlowEngineErrorTest — 7 テストケース (Gap #16)

### 文書化 (5件)
8. FlowStore Javadoc — スレッディング・アトミシティ・バージョン契約 (Gap #1, #2)
9. FlowStore Javadoc — シリアライゼーションガイダンス (Gap #18)
10. FlowEngine Javadoc — 例外カタログ (Gap #8)
11. FlowContext Javadoc — Class キー制約 + 型ラッパー指針 (Gap #10)
12. StateProcessor / TransitionGuard Javadoc — 契約（高速であること、TTL との関係）(Gap #5)
13. README — クイックスタートセクション (Gap #17)
14. README — TTL セマンティクス一文 (Gap #5)

### v0.2.0 先送り (3件)
- フロー定義バージョニング (Gap #6)
- 補償機構 (Gap #11)
- per-state タイムアウト (Gap #13)
- FlowListener / FlowEvent パターン (Gap #9 拡張)
