---
status: accepted
---

# DD-041: FlowContext ミューテーション可視性 — snapshot 案B 採用

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

`syncFromInstance` 内で `instance.context.snapshot()` を呼び、新しい `Map` インスタンスを `setContext` に渡す（案B: immutable snapshot）。

```typescript
// use-flow.ts（修正後）
const syncFromInstance = useCallback((instance: FlowInstance<S>) => {
  setState(instance.currentState);
  setContext(instance.context.snapshot());  // ← new Map → 参照が毎回変わる
  setFlowId(instance.id);
  flowIdRef.current = instance.id;
}, []);
```

`UseFlowResult.context` の型を `FlowContextSnapshot`（= `ReadonlyMap<string, unknown>`）型エイリアスに変更する。

## Rationale

- **既存バグの修正を兼ねる**: 現在の `setContext(instance.context)` は `resumeAndExecute` 後も同一参照を渡すため、React が再レンダーをスキップする既存バグがある。テストで未捕捉。
- **`snapshot()` は既に実装済み**: `FlowContext.snapshot()` は `executeAutoChain` のロールバック用に存在する。コア変更不要。
- **案A（セレクター）は過剰**: フロー遷移頻度は低く、全コンシューマの再レンダーコストは許容範囲。
- **案C（useSyncExternalStore）は危険**: 非同期エンジン（`processor.process()` の途中）でもトリガーされ、部分更新状態がコンシューマに露出するリスクがある。
- **`FlowContextSnapshot` 型エイリアス**: 将来の案A/C へのマイグレーション余地を確保する。

## NOT-DOING

- **セレクター（案A）**: YAGNI。ボトルネックが観測されてから追加する。
- **useSyncExternalStore（案C）**: 非同期エンジンとの相性問題により採用しない。
- **FlowContext への `subscribe` 追加**: コア変更（DD-016）を避ける。

## Specification

- **UI 更新タイミング**: `startFlow` / `resumeAndExecute` 完了後のみ。processor 中間の `put()` は UI に届かない（仕様）。
- **サブフロー**: 親フローの `syncFromInstance` タイミングでまとめて反映される。
