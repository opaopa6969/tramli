# tramli-rust v0.1.0 — レビュー依頼

## 概要

tramli の Rust ネイティブ移植。volta-gateway（Traefik/nginx 代替リバースプロキシ）向け。
Java 版（Maven Central）、TypeScript 版（npm）に続く 3 言語目。

## ステータス

- コンパイル: ✅
- 単純フロー（2状態、context なし）: ✅ テスト通過
- OrderFlow（5状態、context あり）: ❌ stack overflow（下記参照）
- crates.io publish: 未

## アーキテクチャ

```
src/
  lib.rs              — public API, requires!/guard_data! macros
  clone_any.rs        — CloneAny trait (Any + Clone + Send)
  types.rs            — FlowState, StateProcessor, TransitionGuard, BranchProcessor, GuardOutput
  context.rs          — FlowContext (HashMap<TypeId, Box<dyn CloneAny>>)
  definition.rs       — FlowDefinition + Builder + 9 validations + allow_perpetual()
  engine.rs           — FlowEngine (sync)
  instance.rs         — FlowInstance + restore()
  store.rs            — InMemoryFlowStore
  error.rs            — FlowError
```

ゼロ外部依存。MSRV 1.75.0。全 trait は sync（DD-012）。

## レビューしてほしい点

### 1. Stack Overflow の根本原因と対策

**真因**: `HashMap<TypeId, Box<dyn CloneAny>>::clone()` のスタック消費。
`context.snapshot()` → `HashMap::clone()` → 各エントリの `clone_box()` → `Box::new(self.clone())` が vtable dispatch 経由で呼ばれ、一時オブジェクトがスタックに配置される。

**再現**: context に 1 エントリでもあると `execute_auto_chain` 内の `snapshot()` で overflow。
**確認**: `snapshot()` をコメントアウトすると全テスト通過。

対策案:

| 案 | 内容 | メリット | デメリット |
|----|------|---------|-----------|
| A | snapshot/restore 廃止 | 最もシンプル | Java/TS との動作差異 |
| B | heap 上で手動 clone | Java/TS と同じ動作 | 実装が非自明 |
| C | `im` クレートの persistent HashMap | clone O(1) | 外部依存 |

**質問**: どの案が適切か？ 案 B の具体的な実装方法にアドバイスはあるか？

### 2. CloneAny trait の設計

```rust
pub trait CloneAny: Any + Send {
    fn clone_box(&self) -> Box<dyn CloneAny>;
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
}
```

全ユーザー型に `Clone + Send + 'static` を要求。これは妥当か？
`anymap2` クレートとの比較でどうか？

### 3. FlowEngine の sync 設計（DD-012）

`docs/async-integration.md` のパターンに従い、FlowEngine を完全 sync とした。
volta-gateway では `Mutex<FlowEngine>` で包んで async 世界に晒す想定。

```rust
// volta-gateway 側
async fn handle(engine: Arc<Mutex<FlowEngine<S>>>, req: Request) -> Response {
    let flow_id = engine.lock().unwrap().start_flow(def, "s1", data)?;
    let result = external_io().await;  // async I/O は SM の外
    engine.lock().unwrap().resume_and_execute(&flow_id, result_data)?;
}
```

この設計に問題はないか？ ロック粒度は適切か？

### 4. allow_perpetual() — terminal なしフロー

volta-gateway のサーキットブレーカー、ヘルスチェック用。
`checkPathToTerminal` を opt-out する Builder オプション。
デフォルトは terminal 必須（安全側）。

これは Rust 版固有。Java/TS へのバックポートは未定。妥当か？

### 5. async 復活の可能性

真因が clone（async ではない）とわかったので、clone 問題を解決すれば async FlowEngine も技術的には可能。

- sync + 外部 async ラッパー（現在の方針）
- async engine + heap clone（案 B で clone 問題解決後）

どちらが volta-gateway にとってより良いか？

## 設計判断ログ

- [DD-009](../tramli/dge/decisions/DD-009-allow-perpetual.md) — allow_perpetual()
- [DD-010](../tramli/dge/decisions/DD-010-rust-clone-any-typeid-async.md) — CloneAny + TypeId（async 部分は DD-012 で撤回）
- [DD-011](../tramli/dge/decisions/DD-011-volta-gateway-tramli-scope.md) — volta-gateway での適用範囲
- [DD-012](../tramli/dge/decisions/DD-012-rust-sync-engine.md) — Rust 版は完全 sync

## DGE セッション

- [Rust 版型設計](../tramli/dge/sessions/2026-04-07-tramli-rust-design.md) — CloneAny, TypeId, async → sync
- [volta-gateway パターン](../tramli/dge/sessions/2026-04-07-tramli-rust-r2-volta-patterns.md) — CB, health check, config reload, TLS
- [統合設計](../tramli/dge/sessions/2026-04-07-tramli-rust-r3-integration.md) — フロー間連携, graceful shutdown
- [async 診断](../tramli/dge/sessions/2026-04-07-tramli-rust-async-diagnosis.md) — stack overflow の真因特定
