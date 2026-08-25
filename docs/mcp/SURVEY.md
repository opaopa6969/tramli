# MCP 化調査 — tramli

## 概要

tramli は3言語（Java / TypeScript / Rust）で実装された**制約付きフローエンジン**。ステートマシンの不正な遷移をビルド時の8項目検証で構造的に排除し、`requires`/`produces` 契約でデータフローを静的検証する。npm (`@unlaxer/tramli`)、crates.io (`tramli`)、Maven Central (`org.unlaxer:tramli`) で公開中の**ライブラリ**。

唯一のサーバコンポーネントは `tools/viz-server`（WebSocket ベースのリアルタイム可視化サーバ）だが、これは開発時デバッグ用であり独立サービスとしてのデプロイは想定されていない（`/healthz` なし、`/mcp` なし、`volta.service.json` なし）。

## 判定と理由

**判定: `skill-only`**

tramli は import して使うライブラリであり、主要能力（`build()` 検証、Mermaid 生成、DataFlowGraph 分析、SkeletonGenerator）は起動1秒以内の純粋関数の集合。常駐プロセスを立てる意義が薄い（状態を持たず、重いモデル読み込みも不要）。

しかし、エージェントが tramli コードを正しく書くための**設計知識**（8項目検証の意味、3種遷移の使い分け、`requires`/`produces` 契約、Pipeline vs FlowDefinition の選択、非同期統合パターン）は手続き知識として配る価値が高い。既存の充実したドキュメント（SPEC.md、API Cookbook、Async Integration Guide、Language Compatibility Matrix）は resource として配信に適している。

`library-serve`（新規 MCP サーバ化）は**見送り**。tool 化（JSON定義→検証結果）には TS/Rust ランタイムを呼ぶデシリアライズ層が新規に必要で、ROI が低い。

## 公開候補

| kind | name | io / 説明 | 副作用 | 長時間 |
|------|------|-----------|--------|--------|
| skill | `validate-flow` | FlowDefinition の8項目検証手順 | — | no |
| skill | `generate-diagram` | Mermaid 図（状態遷移 + データフロー）生成手順 | — | no |
| skill | `analyze-dataflow` | DataFlowGraph API でデータ依存分析 | — | no |
| skill | `generate-skeleton` | 3言語の Processor スケルトン生成手順 | — | no |
| skill | `choose-flow-pattern` | FlowDefinition vs Pipeline 選択基準 | — | no |
| resource | `spec` | `tramli://spec` — 能力の機械可読仕様 | — | — |
| resource | `guide` | `tramli://guide` — 使い方ガイド | — | — |
| resource | `cookbook` | `tramli://cookbook` — API クックブック | — | — |
| resource | `compat-matrix` | `tramli://compat-matrix` — 3言語対応表 | — | — |
| resource | `async-patterns` | `tramli://async-patterns` — 非同期統合パターン | — | — |

## 組み合わせ例

1. **エージェントが tramli skill で設計** → `tramli__generate-skeleton` 知識でコード骨組み生成 → エージェントが processor を埋める → `build()` で検証
2. **volta-gateway の要求仕様** → tramli skill で FlowDefinition 設計 → Rust コード生成 → `volta__svc_deploy` でデプロイ
3. **tramli DataFlowGraph 分析知識** → 他サービスのデータパイプライン設計レビューに適用

## 依存と協調

| 相手 repo | 方向 | 能力 | 現存 | 備考 |
|-----------|------|------|------|------|
| volta-gateway | provides_to | tramli-rust (crates.io) — request lifecycle を駆動 | yes | review-volta-gateway.md に実績記録 |
| tramli-appspec | provides_to | tramli Java — spec-driven flow design の基盤 | yes | tramli 上に構築 |
| tramli-rust | provides_to | Rust 実装 — 別リポジトリとして crates.io 公開 | yes | lang/rust/ 配下 |
| carta | depends_on | 階層状態機関 vs tramli の flat enum — 設計思想が対照的 | yes | DGE セッションで対比あり |

## ライブラリのサーバ化

**不要** (`library_serve.needed = false`)。常駐プロセスを立てる意義が薄く、tool 化にはデシリアライズ層の新規実装が必要で ROI が低い。

## リスク

- 3言語実装のため、MCP サーバ化する場合は TS 実装をホストする形になるが、Rust/Java ユーザーに同一体験を提供できない
- `build()` 検証や Mermaid 生成を tool 化するにはランタイムで FlowDefinition を構築する必要があり、JSON→FlowDefinition のデシリアライズ層が新規に必要
- viz-server は WebSocket のみで `/healthz` も `/mcp` もない。独立サービス化には HTTP レイヤの追加が必要
- API は Tier-1 (安定) と Tier-2/3 (発展中) があり、tool/resource で公開する範囲の安定性判断が必要

## 持ち主への質問

1. tramli-appspec は既に MCP 化されているか？（catalog には library として登録されているが backend=null）
2. エージェントが tramli コード生成を支援するうえで、`build()` の検証結果をプログラム的に取得できる API はあるか？（`ValidationError` の構造化は TS に見えるが Rust/Java ではどうか）
3. viz-server を独立サービスとして volta に参加させる計画はあるか？（DD-027 で complete 扱いだが hosted URL はない）
