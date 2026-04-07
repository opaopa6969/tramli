# DD-011: volta-gateway での tramli 適用範囲

**Date:** 2026-04-07
**Session:** [rust-r2](../sessions/2026-04-07-tramli-rust-r2-volta-patterns.md), [rust-r3](../sessions/2026-04-07-tramli-rust-r3-integration.md)

## Decision

tramli は volta-gateway の **infra_manager** 内で「長命なインフラ状態」のみ管理する。リクエストライフサイクルには使わない。

対象フロー:
- upstream ヘルスチェック（× N upstreams）
- サーキットブレーカー（× N upstreams）
- 設定ホットリロード（× 1）
- TLS 証明書管理 / ACME（× N domains）

対象外:
- リクエストライフサイクル（ミドルウェアパイプライン）
- レートリミッター（atomic counter）

## Rationale

毎秒数万リクエストが来るプロキシで、リクエストごとに FlowInstance を生成するのは過剰。tramli はインフラ状態（分〜時間の寿命）の遷移正しさを保証し、リクエスト処理（ミリ秒の寿命）はパイプラインで処理する。

load_balancer は circuit_breaker.current_state() を読み取り専用で参照。フロー間イベント伝播は processor 内の resume_and_execute で実現。graceful shutdown は tramli の外で管理。
