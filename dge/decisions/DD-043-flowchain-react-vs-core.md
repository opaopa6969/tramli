---
status: accepted
---

# DD-043: useFlowChain — React 層に置く（コアへの additive 追加は保留）

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

`useFlowChain` のチェーンロジックは **tramli-react 層に置く**。
`FlowEngine` への additive 追加（`FlowEngine.chain()`）は将来の選択肢として保留する。

```typescript
// tramli-react に追加
export function useFlowChain<S extends string>(
  steps: FlowChainStep<S>[],
): UseFlowResult<S>

interface FlowChainStep<S extends string> {
  definition: FlowDefinition<S>;
  initialData?: Map<string, unknown>;
  when?: (prevState: S, prevContext: FlowContextSnapshot, prevError?: Error) => boolean;
}
```

前段の `FlowContextSnapshot` は後段の `initialData` に **コピーして渡す**（参照共有禁止）。

## Rationale

- **React 層で完結できる**: 「前段が terminal に達したら後段を startFlow する」は useEffect + useState で表現可能。コアを変更しなくて済む。
- **DD-016（コア凍結）を尊重**: `FlowEngine.chain()` を追加する場合は DD-016 の再確認が必要。需要が確認されてから判断する。
- **テスタビリティの懸念は `when` シグネチャで対処**: `when(prevState, prevContext, prevError?)` を純粋関数として設計することで、React なしでロジックをテストできる。

## `when` シグネチャ

```typescript
// エラー terminal と正常 terminal を明示的に分離
when?: (
  prevState: S,
  prevContext: FlowContextSnapshot,
  prevError?: Error,
) => boolean;
```

- `prevError` がある場合はエラー terminal からの遷移
- `when` が `undefined` の場合は「前段の任意 terminal → 後段へ進む」

## FlowContext の引き継ぎ

```typescript
// 参照共有禁止: snapshot をコピーして渡す
const nextInitialData = new Map([
  ...prevContextSnapshot,   // 前段の context を引き継ぐ
  ...(step.initialData ?? []),  // step 固有の初期値で上書き
]);
```

ミューテーブルな `FlowContext` を前後段で共有すると、後段の `put()` が前段の状態を破壊する。

## NOT-DOING

- **`FlowEngine.chain()` のコア実装**: 今回は保留。複数プロジェクトで需要が確認されたら DD-016 を再検討して追加する。
- **チェーン条件をフロー定義に埋め込む**: フロー定義（`FlowDefinition`）はチェーン構造を知らない。関心分離を保つ。

## 関連

- DD-041: FlowContext snapshot（前段 context のコピー方針）
- DD-042: FlowProvider 1エンジン前提（useFlowChain も同じエンジンを使う）
- DD-016: コア凍結原則
