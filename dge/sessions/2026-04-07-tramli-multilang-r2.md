# DGE Session: tramli マルチ言語展開 — Round 2

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (round 2)
- **Pattern**: before-after + protocol-design
- **Characters**: ☕ ヤン, 👤 今泉, 🎩 千石, ⚔ リヴァイ, 🕵 右京
- **Focus**: TypeScript 移植の詳細設計

## 解決策確定

### FlowContext キー方式 (Gap #3)
- `FlowKey<T>` branded string パターン
- `flowKey<T>(name)` で型と名前を一度に定義
- ランタイムは string、型推論で T を返す

### FlowState モデリング (Gap #4)
- string literal union + `as const satisfies Record<S, StateConfig>`
- Builder は `<S extends string>` ジェネリクスで from/to を制約

### Builder DSL (Gap #5)
- Java 版とほぼ同一の API 表面
- build() で 9 バリデーション全実装（ランタイム）

### GuardOutput (Gap #6)
- discriminated union: `{ type: 'accepted' | 'rejected' | 'expired', ... }`

### バリデーション (Gap #7)
- build() ランタイムで Java 版と同等の 9 チェック

## 新規 Gap

### FlowEngine の async 対応
- TypeScript 版は FlowEngine/processor/guard すべて async
- 「高速であるべき」の指針は JSDoc で維持
- Java 版との契約差異として明記

### TypeScript パッケージ構造
- ESM, tsc のみ, ゼロ依存, Node 18+
- ~10 ファイル、~800 行

## TS ファイル構成 (確定)

```
src/
  index.ts           — public API re-exports
  tramli.ts          — static factory (define, engine)
  types.ts           — FlowState, Transition, StateProcessor, TransitionGuard, etc.
  flow-key.ts        — FlowKey<T> branded type + flowKey() helper
  flow-context.ts    — FlowContext (Map<string, unknown>)
  flow-definition.ts — FlowDefinition + Builder + 9 validations
  flow-engine.ts     — FlowEngine (async)
  flow-instance.ts   — FlowInstance + restore()
  flow-error.ts      — FlowError + static factories
  flow-store.ts      — FlowStore interface (in types.ts)
  in-memory-flow-store.ts — InMemoryFlowStore
  mermaid-generator.ts — MermaidGenerator
```
