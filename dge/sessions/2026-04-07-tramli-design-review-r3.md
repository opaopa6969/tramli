**Decisions:** [DD-002](../decisions/DD-002-no-compensation-no-per-state-timeout.md)

# DGE Session: tramli 設計レビュー — Round 3 (自動反復)

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (auto-iterate round 3/5)
- **Pattern**: expertise-contrast + migration-path
- **Characters**: ☕ ヤン, 👤 今泉, 🧑‍🏫 金八, 🎭 ソクラテス, 📊 ビーン
- **Focus**: Medium 以下の Gap 深掘り + 初心者体験 + シリアライゼーション + 可観測性

## 新規 Gap

### Getting Started / チュートリアルの欠如 (Medium)
- Class キー設計パターン（専用 record で包む）が言語化されていない
- initiallyAvailable の意味が自明でない
- README は哲学寄りで、初心者が最初の10分で動かせるガイドがない

### FlowContext のシリアライゼーションガイダンス欠如 (Medium)
- Class キーの永続化戦略（FQCN? レジストリ?）が未定義
- Jackson optional なのにシリアライズ方法の指針がない

## 昇格

### Gap #12: FlowInstance の再構築が外部パッケージから不可能 → Medium → High
- guardFailureCount, version, exitState, createdAt のセッター/コンストラクタ引数がパッケージプライベート
- 外部パッケージの FlowStore 実装は FlowInstance を復元できない

### Gap #16: 異常系テストの不足 → Low → Medium
- OSS ライブラリとしての信頼性指標に直結
- Round 2 の processor 例外修正と同時にテスト追加すべき

## 解決策確定

### Gap #9: 可観測性
- v0.1.0: TransitionRecord に `Instant timestamp` 追加
- v0.2.0: FlowEvent + FlowListener パターンへ拡張

### Gap #11 (補償) / #13 (per-state タイムアウト): v0.2.0+ 先送り確定
- guard の Expired + error state processor で近似可能
- 設計判断として記録推奨
