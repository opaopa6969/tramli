---
status: accepted
---

# DD-045: FlowProvider — resume 同時呼び出し排他制御

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

`FlowProvider` は `isLoading` 中の `resume` 呼び出しを**黙って無視する**（throw しない）。
複数コンシューマが同時に `resume` を呼べる状態になるが、最初の呼び出しのみ実行される。

```typescript
// Provider 内部
const resume = useCallback(async (externalData?) => {
  if (isLoadingRef.current) return;  // ← 排他制御
  // ...
}, []);
```

## Rationale

- `FlowEngine` はシングルスレッドアクセス前提（`types.ts` に明記）。並行 `resumeAndExecute` は未定義動作。
- `useFlow` 単体では `useRef` でエンジンをコンポーネントに封じていたため問題が起きにくかった。
- `FlowProvider` で複数コンシューマが同じ `resume` を共有すると、ダブルクリックや競合 useEffect からの同時呼び出しが現実的に起きる。
- **throw よりも無視**: UX 上、「ローディング中は操作を受け付けない」は自然な挙動。throw すると呼び出し側全員がエラーハンドリングを書く必要が生じる。

## NOT-DOING

- **FlowEngine への排他ロック追加**: コア変更（DD-016）を避ける。React 層で吸収する。
- **キューイング**: 後続の resume をキューに積む設計は複雑すぎる。YAGNI。

## 関連

- DD-042: FlowProvider 1エンジン前提
- DD-041: FlowContext snapshot（resume 後の再レンダー保証）
