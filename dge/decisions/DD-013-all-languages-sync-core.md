# DD-013: 全言語 sync コアに統一（DD-006 撤回検討）

**Date:** 2026-04-07
**Session:** tramli-rust async 診断後の議論
**Status:** draft — レビュー待ち

## Decision (案)

全言語の FlowEngine / StateProcessor / TransitionGuard / BranchProcessor を sync に統一する。

- **Java**: 変更なし（元々 sync）
- **TypeScript**: DD-006 を Supersede し、async → sync に変更
- **Rust**: DD-012 の通り sync

async I/O は全言語で `async-integration.md` パターンを適用:
```
SM start() (sync, μs) → async I/O (外部) → SM resume() (sync, μs)
```

## Rationale

### 現状の API 不一致

| 言語 | processor.process() | engine.startFlow() |
|------|--------------------|--------------------|
| Java | `void` (sync) | sync |
| TypeScript | `Promise<void>` (async) | `Promise<FlowInstance>` (async) |
| Rust | `Result<(), FlowError>` (sync) | sync |

3 言語間で API が割れている。共有テストスイート（TECH-009）で振る舞い一致を保証する前提なのに、呼び出しパターンが言語ごとに異なる。

### sync 統一の根拠

1. `async-integration.md`: 「tramli is intentionally synchronous. It makes judgments in microseconds」
2. Rust 版の stack overflow 診断で、async の不要性が技術的に確認された
3. 3 言語の API 一貫性は共有テストスイートの前提条件
4. sync は全言語で最もシンプル、テストしやすい、ポータブル

### TypeScript での影響

```typescript
// Before (async)
const flow = await engine.startFlow(def, sessionId, data);
const resumed = await engine.resumeAndExecute(flowId, def);

// After (sync)
const flow = engine.startFlow(def, sessionId, data);
const resumed = engine.resumeAndExecute(flowId, def);

// async I/O は外部
const authResult = await checkAuth(request);  // ← async はここ
engine.resumeAndExecute(flowId, def, new Map([...]));  // ← sync
```

TS の async overhead は小さいが、sync に揃えることで:
- API が Java/Rust と完全一致
- テストから async ボイラープレートが消える
- `async-integration.md` のパターンが全言語で統一

### async が将来必要になった場合

全言語で feature flag / optional module として提供:
- Java: `tramli-async` モジュール（`CompletableFuture` 版）
- TypeScript: `@unlaxer/tramli-async`（または export path `tramli/async`）
- Rust: `features = ["async"]`

## Open Questions（レビューで確認したい）

1. TS 版を sync に変更すると `@unlaxer/tramli@0.1.0` との後方互換性が壊れる。`0.2.0` でリリースするか？
2. TS の Node.js エコシステムで sync API は受け入れられるか？（DB アクセス等は async が標準）
3. processor 内で軽い async I/O（メトリクス送信等）をしたいユースケースをどう扱うか？
