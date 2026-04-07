# DD-003: マルチ言語はネイティブ移植が本線、HTTP API は監視レイヤー

**Date:** 2026-04-07
**Session:** [multilang-strategy](../sessions/2026-04-07-tramli-multilang-strategy.md)
**Gap:** #1 (ネイティブ vs HTTP), #2 (プロセッサ実行モデル)

## Decision

各言語へのネイティブライブラリ移植を本線とする。HTTP API はフロー状態の外部公開・監視用に限定し、プロセッサ/ガードのリモート実行は行わない。

## Rationale

tramli の核心的価値（ビルド時 9 種バリデーション、型安全な FlowContext、sealed GuardOutput、auto-chain 高速実行）はすべてプロセス内実行を前提としている。HTTP API 化すると：
- プロセッサ実行に Webhook が必要 → auto-chain で 4 回の HTTP ラウンドトリップ
- ビルド時バリデーションが効かない（フロー定義はラムダを含み JSON 化困難）
- 「高速 auto-chain」の設計思想が崩壊

リヴァイ: 「Webhook にしたら auto-chain のたびに HTTP ラウンドトリップが走る。設計思想が崩壊する」
ヤン: 「ネイティブ移植が本線。HTTP API はオプショナルな監視レイヤー」

## Alternatives considered

- **HTTP API 中心 + thin client**: 移植コストゼロだが tramli の価値の大半が失われる
- **gRPC + ストリーミング**: Webhook より低遅延だが、各言語で gRPC クライアント必要。ネイティブ移植と同等以上の複雑さ
