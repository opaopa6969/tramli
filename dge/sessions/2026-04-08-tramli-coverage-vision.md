# DGE Session: define + pipeline + sub で全コードカバーできるか

- **Date**: 2026-04-08
- **Flow**: 💡 ブレスト
- **Characters**: ☕ ヤン, 👤 今泉, 🎭 ソクラテス, 🤝 後輩

## 結論

- Sub-Pipeline は不要。asStep() で完全カバー
- ビジネスロジックの 90% を tramli (define + pipeline) でカバー可能
- 残りは I/O、設定、フレームワーク連携、テスト（構造的に外）
- 初期化コード、リクエスト処理パイプラインも Pipeline で書ける

## tramli = 骨格、I/O = 肉

tramli でカバーされる部分が Mermaid で可視化される。
非エンジニアに見せるのは骨格（ビジネスフロー）であって I/O の詳細ではない。

## カバレッジ見積もり (volta-auth-proxy)

| 領域 | 行数 | tramli | 可視化 |
|------|------|--------|--------|
| FlowDefinition + Processors | 500 | ✅ define | Mermaid |
| リクエスト処理 | 300 | ✅ pipeline | Mermaid |
| 初期化 | 100 | ✅ pipeline | Mermaid |
| FlowStore (PostgreSQL) | 90 | ❌ I/O | — |
| ルーティング | 50 | ❌ glue | — |
| 設定/DI | 80 | ❌ glue | — |
| I/O 実装 | 400 | ❌ | — |
| テンプレート | 300 | ❌ | — |

ビジネスロジック: 90% tramli → 100% Mermaid 可視化
