# DGE Session: 偉人の指摘を受けて — 設計チームの応答

- **Date**: 2026-04-08
- **Flow**: 🔍 design-review
- **Characters**: ☕ ヤン, 👤 今泉, 🎩 千石, 🔬 ハレル教授

## 結論

### やる
1. FlowDefinition.warnings() — build 時の構造的警告（perpetual + External = liveness リスク）
2. 論文に系譜年表 + liveness 議論 + 検証しないことの正当化を追加

### やらない
- 並列実行（検証できないものは入れない原則）
- BuildResult API 変更（v1.x 互換）
- per-state timeout（将来検討、DD-002 踏襲）

### 設計原則の確認
「検証できないものは入れない」——並行性、liveness の完全検証は tramli のスコープ外。
warnings で情報提供し、判断はユーザーに委ねる。
