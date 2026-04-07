---
status: accepted
---

# DD-018: FlowStore サービス化は行わない。ドキュメント + エイリアス API で対応

**Date:** 2026-04-07
**Session:** [flowstore-portability](../sessions/2026-04-07-tramli-flowstore-portability.md)

## Decision

1. FlowStore サービス化（gRPC/HTTP）は**行わない**
2. I/O 分離は**設計ガイド**として提供（`docs/patterns/io-separation.md`）
3. 推奨 DB スキーマ + FlowContext シリアライズ仕様を**ドキュメント化**
4. FlowContext に**エイリアス登録 API** を追加（Java/Rust。TS は FlowKey が既に文字列）

## Rationale

- FlowStore 書き直しは 1 日。サービス化は 1 ヶ月+運用コスト。ROI が合わない
- tramli の 2μs がネットワーク越しの 5ms になるレイテンシ劣化
- 各言語の FlowStore 実装が同じ DB スキーマを使えばデータは共有可能
- I/O 分離は既存の DI / External transition パターンで実現可能。API 変更不要
- tramli 本体のゼロ依存ポリシーを維持

## NOT-DOING

- FlowStore gRPC/HTTP サービス
- wire protocol 定義
- tramli-json 等のシリアライズパッケージ（将来需要次第）
