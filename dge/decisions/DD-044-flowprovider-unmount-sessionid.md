---
status: accepted
---

# DD-044: FlowProvider アンマウント時のフロー消失 — sessionId 注入で復元可能にする

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

`FlowProvider` は `sessionId` を外部から注入できる prop を持つ。
同じ `sessionId` で再マウントした場合、`InMemoryFlowStore` に残っているフロー状態を復元する。

```tsx
<FlowProvider sessionId="auth-session-abc123">
  <App />
</FlowProvider>
```

`sessionId` を省略した場合は `crypto.randomUUID()` で生成（現行 `useFlow` と同じ挙動）。

## Rationale

- `InMemoryFlowStore` はメモリのみ。Provider がアンマウントされると `WAITING` 状態のフローが消える。
- モーダル閉じ → 再表示のような一時的アンマウントで MFA 途中状態が失われるのは UX 上の問題。
- `sessionId` を外部（URL params / localStorage）で管理すれば再マウント時に復元できる。
- **「意図した消滅」と「意図しない消滅」を呼び出し側が制御できる設計にする。**

## NOT-DOING

- **永続化（localStorage / IndexedDB）**: `InMemoryFlowStore` の外で行う。tramli-react の責務外。
- **自動 sessionId 推論**: ルーターや URL から自動取得しない。呼び出し側が明示的に渡す。

## 関連

- DD-042: FlowProvider 1エンジン前提
- DD-018: FlowStore サービス化しない
