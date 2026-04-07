# DD-010: Rust 版の型設計 — CloneAny + TypeId + native async

**Date:** 2026-04-07
**Superseded by:** [DD-012](DD-012-rust-sync-engine.md) (async 部分のみ撤回)
**Session:** [rust-design](../sessions/2026-04-07-tramli-rust-design.md)

## Decision

1. **FlowContext**: `HashMap<TypeId, Box<dyn CloneAny>>` — 全ユーザー型に `Clone + Send + 'static` を要求
2. **snapshot/restore**: HashMap::clone() で実現（CloneAny が clone_box() を提供）
3. **エラー**: `Result<(), FlowError>` ベース。FlowError に source フィールド
4. **async**: Rust 1.75+ の native async fn in trait。runtime-agnostic
5. **スレッド安全性**: processor/guard は `Send + Sync`、FlowInstance は `Send` のみ

## Rationale

snapshot/restore は tramli の核心機能（TECH-001）。Rust では `Box<dyn Any>` が Clone 非対応のため、`CloneAny` trait を定義して clone_box() 経由で HashMap 全体を clone する。`#[derive(Clone)]` で対応可能なので負担は小さい。

volta-gateway はマルチスレッドのため Send+Sync が必須。FlowDefinition は Arc で共有、FlowInstance はリクエストスレッドが排他所有。

リヴァイ: 「Clone はほぼ全ての Rust 型が derive できる。コンパイルエラーで気づける。Rust らしい」
ヤン: 「Rust の enum + match が Java の sealed interface と完全等価。最も Java に近い言語は実は Rust」
