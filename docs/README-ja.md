[English](README.md)

# tramli ドキュメント一覧

`docs/` 以下の文書と、それぞれ誰向けかをまとめたページです。tramli が初めてなら、まず [リポジトリの README](../README-ja.md#なぜ-tramli-が必要か) を読んでください。tramli が解決する問題、他ライブラリとの違い、向いていないケースを説明しています。

## おすすめの読む順番

1. [README — なぜ tramli が必要か](../README-ja.md#なぜ-tramli-が必要か) — 解決する問題、他の選択肢、before/after の例
2. [README — クイックスタート](../README-ja.md#クイックスタート) — 状態・Processor・フローを定義して実行する
3. [実践例: OIDC ログインフロー](example-oidc-auth-flow-ja.md) — 9 状態・5 Processor の完全なフロー
4. [API クックブック](api-cookbook-ja.md) — 必要になったときにメソッドを引く
5. [パターン集](#パターン集) — 永続化、長期間続くフロー、I/O の分離が必要になったとき

## 利用者向けガイド

| 文書 | こんなときに読む |
|------|-----------------|
| [なぜ tramli は効くのか — アテンション・バジェット](why-tramli-works-attention-budget-ja.md)（[English](why-tramli-works.md)） | データの入出力を宣言すると、変更時に読む範囲がなぜ絞れるのかを知りたい |
| [実行前にデータ依存を検査する（英語）](article-build-time-dataflow.md) | XState・Spring Statemachine・statig との違いと、tramli の限界を知りたい |
| [実践例: OIDC ログインフロー](example-oidc-auth-flow-ja.md)（[English](example-oidc-auth-flow.md)） | 現実的なフローを状態と Processor にどう分けるかを見たい |
| [API クックブック](api-cookbook-ja.md)（[English](api-cookbook.md)） | 特定の API の使用例を探したい |
| [言語ガイド](language-guide-ja.md)（[English](language-guide.md)） | Java・TypeScript・Rust のどれを使うか決めたい、違いを知りたい |
| [言語互換性マトリクス（英語）](language-compatibility-matrix.md) | 他言語への移植候補を評価したい |
| [非同期連携（英語）](async-integration.md) | フローから HTTP API や DB などの非同期 I/O を呼びたい |
| [API 安定性（英語）](api-stability.md) | バージョンアップをまたいで依存して安全な API を知りたい |
| [プラグインガイド](plugin-guide-ja.md)（[English](plugin-guide.md)） | 各プラグインが何を解決し、どう設定するかを調べたい |
| [プラグイン チュートリアル](tutorial-plugins-ja.md)（[English](tutorial-plugins.md)） | 動かせる例で、プラグインを順に試したい |

## パターン集

| パターン | 解決する問題 |
|---------|-------------|
| [カスタム FlowStore（英語）](patterns/custom-flowstore.md) | フローをメモリ以外に保存したい |
| [FlowStore のスキーマ（英語）](patterns/flowstore-schema.md) | DB でフローを保存・復元し、同時更新を扱いたい |
| [I/O の分離（英語）](patterns/io-separation.md) | ネットワークや DB の呼び出しを遷移ロジックから切り離したい |
| [長期間続くフロー](patterns/long-lived-flows-ja.md)（[English](patterns/long-lived-flows.md)） | 何日も続くフローや、実行中のインスタンスがある状態でフロー定義を変えたい |
| [ノンブロッキング Sink（英語）](patterns/non-blocking-sink.md) | 遷移を遅くせずにログやイベントを送りたい |

## 仕様と研究

挙動を厳密に定める文書です。移植版の実装、コアへの貢献、境界ケースの確認に使います。

| 文書 | 内容 |
|------|------|
| [FlowContext 仕様](specs/flow-context-spec.md) | フロー実行中のデータの保存と読み出し |
| [FlowDefinition 仕様](specs/flow-definition-spec.md) | ビルダーと build 時の検証ルール |
| [FlowEngine 仕様](specs/flow-engine-spec.md) | 実行、自動連鎖、エラー、再開の挙動 |
| [共有テストシナリオ](specs/shared-test-scenarios.md) | 3 言語の実装すべてが通すべきシナリオ |
| [論文: 制約付きフローエンジン tramli](paper-tramli-constrained-flow-engine.md) | 設計、検証モデル、関連研究との比較 |

（仕様と論文は英語です）

## AI コーディングエージェント向け

[`skills/`](skills/) には AI エージェント向けの作業手順があります（データフロー分析、フローパターンの選択、図とスケルトンの生成、フローの検証）。

## 内部記録

次の文書は、プロジェクトの経緯、特定の採用プロジェクトからのフィードバック、ある時点の計画メモです。経緯をたどれるよう当時のまま残しているため、古い API やプロジェクト内の前提で書かれていることがあります。**tramli を使うだけなら読む必要はありません。**

| 文書 | 記録している内容 |
|------|-----------------|
| [ROADMAP](ROADMAP.md)、[backlog](backlog.md) | 予定と完了済みの作業 |
| [session-handoff-2026-04-09*.md](session-handoff-2026-04-09.md) | 開発セッション間の引き継ぎメモ |
| [feedback/](feedback/) | volta-auth-proxy に tramli を組み込んだときのフィードバック |
| [review-volta-gateway](review-volta-gateway-ja.md)（[English](review-volta-gateway.md)） | volta-gateway で tramli-rust を使ったときのレビュー |
| [proposal-cross-language-portability](proposal-cross-language-portability.md)、[request-flowinstance-version-api](request-flowinstance-version-api.md) | 機能の提案と要望 |
| [tramli_plugin_handoff](tramli_plugin_handoff.md) | Java プラグインパックを取り込む計画 |
| [market/](market/) | 類似ライブラリの調査（日付つき） |
| [mcp/](mcp/) | tramli の skill を MCP で配信する設計と状況 |
