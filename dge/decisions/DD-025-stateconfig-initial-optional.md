---
status: accepted
---

# DD-025: StateConfig.initial を optional にする (default: false)

**Date:** 2026-04-09

## Decision

TypeScript の `StateConfig` 型で `initial` フィールドを optional にし、省略時は `false` とする。Java/Rust はユーザー定義 enum のため、ドキュメント/例でのみ 1 引数コンストラクタパターンを示す。

## Rationale

- 1 フロー中で `initial: true` は 1 状態だけ。残りは全て `false`
- `REDIRECTED(false, false)` の第 2 引数は常にノイズ
- 省略可能にすることで「initial だけ明示」という意図が際立つ

## Before / After

```typescript
// Before
const config = {
  CREATED:   { terminal: false, initial: true },
  PENDING:   { terminal: false, initial: false },  // ← noise
  DONE:      { terminal: true,  initial: false },  // ← noise
};

// After
const config = {
  CREATED:   { terminal: false, initial: true },
  PENDING:   { terminal: false },                   // initial defaults to false
  DONE:      { terminal: true },
};
```

## Impact

- **TypeScript**: `StateConfig` 型変更 + `FlowDefinition` 内で `?? false` 追加
- **Java**: フレームワーク変更なし。例で 1 引数コンストラクタパターンを示す
- **Rust**: フレームワーク変更なし。例でヘルパーコンストラクタを示す
- **後方互換**: 完全互換（既存の `initial: false` はそのまま動く）
