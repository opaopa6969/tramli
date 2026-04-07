# DGE Session: FlowStore サービス化 + I/O 分離パターン

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review
- **Structure**: 🗣 座談会
- **Characters**: ☕ ヤン, 👤 今泉, 🦅 鷲津, ⚔ リヴァイ
- **Input**: docs/proposal-cross-language-portability.md（提案 4, 5）

## 結論

- FlowStore サービス化: **やらない**（ROI 不足。書き直し 1 日 vs サービス化 1 ヶ月+運用）
- I/O 分離: **設計ガイドで提供**（API 変更なし）
- FlowContext エイリアス: **やる**（Java/Rust にエイリアス登録 API 追加）
- DB スキーマ: **推奨スキーマをドキュメント化**

## やること

1. `docs/patterns/io-separation.md` — I/O 分離 3 パターン + 推奨度 + サンプル
2. `docs/patterns/flowstore-schema.md` — 推奨 DB スキーマ + シリアライズ仕様
3. FlowContext エイリアス API（Java/Rust）

## やらないこと

- FlowStore サービス化（gRPC/HTTP）
- wire protocol 定義
- tramli-json 等のシリアライズパッケージ（将来需要次第）
- Processor API への変更
