# DGE Session: tramli Rust 版 — Round 3 (volta-gateway 統合パターン)

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (round 3)
- **Pattern**: escalation-chain + disaster-recovery
- **Characters**: ☕ ヤン, 👤 今泉, 🏥 ハウス, 📊 ビーン, ⚔ リヴァイ

## 設計決定

### TLS 証明書管理 (ACME) パターン
- Valid→Expiring→Ordering→Challenging→Finalizing→Valid/Failed
- Challenging 状態で ACME challenge endpoint を有効化（フロー状態の外部参照）
- Failed からは旧証明書で自動復旧

### フロー状態の外部参照パターン
- FlowInstance.current_state() をリクエストパスから読み取り
- load_balancer が circuit_breaker の状態を参照して routing 判断
- tramli の追加機能不要

### フロー間イベント伝播パターン
- processor 内で別フローの resume_and_execute を呼ぶ
- HealthCheck の probe success → CircuitBreaker の resume トリガー
- 循環依存はアプリ設計の責務

### Graceful shutdown
- tramli の外で管理（resume 停止 + await + ログ）
- 全フローが起動時に再初期化可能 → v0.1.0 では永続化不要

### 可観測性
- tramli は current_state() と TransitionRecord を提供
- メトリクス変換、管理エンドポイントは volta-gateway 側

### volta-gateway 統合アーキテクチャ
```
volta-gateway
├── request_handler     ← tramli 不使用、状態読み取りのみ
├── infra_manager       ← tramli がここに住む
│   ├── health_checker  × N upstreams
│   ├── circuit_breakers × N upstreams
│   ├── config_reloader × 1
│   └── cert_manager    × N domains
├── admin_api           ← FlowInstance.current_state() 読み取り
└── lifecycle           ← startup: 全フロー初期化, shutdown: graceful
```
