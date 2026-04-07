# DGE Session: tramli Rust 版 — volta-gateway 向け

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review
- **Structure**: 🗣 座談会
- **Pattern**: pre-release + concurrent-operation
- **Characters**: ☕ ヤン, 👤 今泉, ⚔ リヴァイ, 🎩 千石, 😈 Red Team

## 設計決定

### snapshot/restore: CloneAny trait (案A)
- `trait CloneAny: Any + Clone + Send` で全ユーザー型に Clone を要求
- `HashMap<TypeId, Box<dyn CloneAny>>` で snapshot = HashMap::clone()
- `#[derive(Clone)]` で対応。Rust らしい型制約

### FlowContext: TypeId キー
- `put<T: CloneAny>(value: T)` — 型自体がキー
- `get<T: CloneAny>() -> Result<&T, FlowError>` — downcast_ref
- requires/produces は `requires!` マクロで簡略化

### エラー処理: Result ベース
- processor: `async fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError>`
- `FlowError { code, message, source: Option<Box<dyn Error + Send + Sync>> }`
- engine は match で error transition へルーティング

### GuardOutput: Rust enum
- `Accepted { data }` / `Rejected { reason }` / `Expired`
- `guard_data!` マクロで HashMap 構築を簡略化

### FlowState: trait + 手動 impl
- `trait FlowState: Clone + Copy + Eq + Hash + Debug + Send + Sync + 'static`
- `all_states()` で全列挙
- v0.2.0 で derive macro 検討

### async: native async fn in trait
- Rust 1.75+ — `async-trait` クレート不要
- runtime-agnostic (tokio 非依存)
- 同期プロセッサも async fn で書く（await なし）

### スレッド安全性
- CloneAny: `Send` 必須
- processor/guard: `Send + Sync`
- FlowDefinition: `Arc` で共有、`Send + Sync`
- FlowInstance: `Send` のみ（排他アクセスは FlowStore で保証）

### クレート構造
- 単一クレート `tramli` on crates.io
- ~975 lines, ~12 files
- MSRV 1.75.0
- ゼロ外部依存
