# DGE Session: tramli Rust 版 — Round 2 (volta-gateway フローパターン)

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (round 2)
- **Pattern**: escalation-chain + concurrent-operation
- **Characters**: ☕ ヤン, 👤 今泉, 😈 Red Team, 🏥 ハウス, ⚔ リヴァイ

## 設計決定

### tramli の適用範囲
- ✅ upstream ヘルスチェック、サーキットブレーカー、設定ホットリロード、TLS 証明書管理
- ❌ リクエストライフサイクル（パイプライン/ミドルウェアが適切）
- ❌ レートリミッター（atomic counter が適切）
- tramli は「長命なインフラ状態」を管理。リクエスト単位では使わない

### allow_perpetual()
- terminal なしの永続ループフローを許容する Builder オプション
- デフォルトは terminal 必須（安全側）
- サーキットブレーカー、ヘルスチェック等で必要
- Rust 版のみ追加。Java/TS へのバックポートは需要待ち

### サーキットブレーカーパターン
- Closed/Open/HalfOpen — 全遷移 external（タイマーは外部管理）
- tramli は遷移順序の正しさを保証。タイミングは外部の責務

### 設定ホットリロードパターン
- Running→Validating→Draining→Swapping→Running
- Validating スキップ防止、Failed からの自動復旧を tramli が保証

### マルチインスタンス管理
- upstream ごとに FlowInstance
- FlowStore の並行アクセスは外部ロック（v0.1.0）
