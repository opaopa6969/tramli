# DD-009: allow_perpetual() — terminal なし永続ループフロー

**Date:** 2026-04-07
**Session:** [rust-r2](../sessions/2026-04-07-tramli-rust-r2-volta-patterns.md)

## Decision

Rust 版 Builder に `allow_perpetual()` を追加。terminal 状態なしのフローを許容する。デフォルトは terminal 必須（安全側）。

## Rationale

volta-gateway のインフラ状態（サーキットブレーカー、ヘルスチェック）は永続ループ。「Closed→Open→HalfOpen→Closed」に終了状態はない。Java 版の checkPathToTerminal がこれを弾く。

ハウス: 「tramli は『フローは最終的に完了する』と仮定している。だがサーキットブレーカーは終わらない」
Red Team: 「デフォルトは terminal 必須。間違えて terminal を忘れたフローが黙って通るのは危険」

Java/TS へのバックポートは需要待ち（takt で永続監視ループが必要になったら）。

## Alternatives considered

- **ダミー terminal 状態を追加（Shutdown）**: 概念的に不自然。サーキットブレーカーに「終了」はない。
