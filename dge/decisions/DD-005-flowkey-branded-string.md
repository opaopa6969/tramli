# DD-005: TypeScript の FlowContext キーは FlowKey branded string

**Date:** 2026-04-07
**Session:** [multilang-r2](../sessions/2026-04-07-tramli-multilang-r2.md)
**Gap:** #3 (FlowContext の Class<?> キーが他言語で再現不可)

## Decision

TypeScript 版の FlowContext は `FlowKey<T>` branded string パターンを採用する。

```typescript
type FlowKey<T> = string & { __type: T };
function flowKey<T>(name: string): FlowKey<T> { return name as FlowKey<T>; }
```

## Rationale

Java の `Class<?>` キーに相当する仕組みが TypeScript に必要。4 案を比較した結果：

- class をキー: Java に最も近いが TS では class 強制が不自然
- string キー + ジェネリクス: 文字列衝突リスク、typo リスク
- Symbol キー: 衝突なし・型安全だが、シリアライゼーション困難
- **FlowKey branded string**: 文字列ベース（デバッグ・シリアライゼーション容易）かつ型推論で T を返す

千石: 「flowKey<T>(name) で型と名前を一度に定義 — Java の record 宣言に対応」
右京: 「requires/produces も FlowKey[] として宣言でき、checkRequiresProduces がそのまま移植可能」

## Alternatives considered

- **class コンストラクタをキー**: Java に最も近いが、TS の interface/type 文化と衝突
- **Symbol キー**: 衝突なしだが JSON シリアライゼーション不可
