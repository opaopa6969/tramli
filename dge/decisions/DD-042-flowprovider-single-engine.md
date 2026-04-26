---
status: accepted
---

# DD-042: FlowProvider — 1アプリ=1エンジン前提、ネスト禁止

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

`FlowProvider` は「エンジンを React Context に置くだけ」の薄いコンポーネントとして設計する。
アプリケーション内に `FlowProvider` のネストは禁止する。

```tsx
// 正: アプリルートに1つだけ
<FlowProvider>
  <App />
</FlowProvider>

// 禁: ネストは使用禁止
<FlowProvider>
  <FlowProvider>  {/* ← NG */}
    ...
  </FlowProvider>
</FlowProvider>
```

複数フロー定義は、同一エンジンで管理し `useFlowContext(flowName)` で引く：

```typescript
function MfaChallenge() {
  const { state, resume } = useFlowContext('mfa-flow');
}

function SessionStatus() {
  const { state } = useFlowContext('session-flow');
}
```

## Rationale

- **ネスト許容はエンジン分断を招く**: React Context は最近傍 Provider が勝つ。ネストすると内外のエンジンが分断され、session ↔ mfa 間のフロー状態連携ができなくなる。
- **FlowEngine はマルチフロー対応済み**: `startFlow` は `definition` を毎回受け取る設計であり、1つのエンジンで複数フロー定義を管理できる。
- **エンジンのライフサイクルをアプリと一致させる**: アプリルートに置くことで、ルーター遷移やモーダルのアンマウントでエンジンが消えない。

## NOT-DOING

- **`<FlowProvider mode="overlay">` 等のネスト制御API**: 不要。ネストそのものを禁止する。
- **FlowProvider を複数定義の集約器にする**: `FlowProvider` の責務は「エンジンを Context に置く」のみ。フロー定義の管理は呼び出し側（`useFlowContext`）に委ねる。

## 関連

- DD-021: Flat is Correct（フロー設計をフラットに保つ）
- DD-007e（G-007g）: Provider アンマウント時の進行中フロー消失 → sessionId 注入で復元可能にする（別途検討）
