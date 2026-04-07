# DD-006: TypeScript 版の FlowEngine は全 async

**Date:** 2026-04-07
**Session:** [multilang-r2](../sessions/2026-04-07-tramli-multilang-r2.md)

## Decision

TypeScript 版は FlowEngine, StateProcessor, TransitionGuard, BranchProcessor すべて async (Promise ベース) とする。Java 版の「プロセッサは高速であること」の指針は JSDoc で維持する。

## Rationale

Java は同期が自然、TypeScript は async が自然。TS エコシステムでは DB アクセスすら async であり、sync only を強制すると使いづらい。

- `startFlow()` → `Promise<FlowInstance<S>>`
- `resumeAndExecute()` → `Promise<FlowInstance<S>>`
- `processor.process()` → `Promise<void>`
- `guard.validate()` → `Promise<GuardOutput>`

auto-chain は `await` で順次実行。try/catch + snapshot/restore のエラーハンドリングは Java 版と同等に機能する（async/await の try-catch は同期例外と Promise rejection の両方を捕捉）。

右京: 「Java は同期が自然で async は明示的。TypeScript は async が自然で sync は特殊ケース」
千石: 「API は async だけど、契約は高速。使い方の問題」

## Alternatives considered

- **sync only（Java と同じ）**: TS エコシステムで不自然。DB や外部 API を使うプロセッサが書けない。
