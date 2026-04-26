---
status: accepted
---

# DD-046: tramli-react — UI 更新タイミングの仕様明文化

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #30

## Decision

tramli-react の UI 更新タイミングを以下のように**仕様として明文化**し、README / JSDoc に記載する：

> **UI は `startFlow` / `resumeAndExecute` の完了後にのみ更新される。**
> processor 内の中間的な `context.put()` は UI に届かない。
> 中間状態を UI に見せたい場合は、フローを分割して外部遷移（`WAITING` ステート）を追加する。

## Rationale

- `syncFromInstance` は `startFlow` / `resumeAndExecute` の後にのみ呼ばれる（現行実装・意図的な設計）。
- AutoChain が複数ステップを一気に走る間の `put()` を逐一 UI に届けることは **設計上サポートしない**。
- 「processor 中の中間 put() が画面に出ない」というユーザーの混乱を防ぐためにドキュメント化が必要。
- 中間状態を見せたいケースはフロー分割で解決できる（tramli の正しい使い方）。

## アクション

- `tramli-react/README.md` に「UI 更新タイミング」セクションを追加
- `useFlow` の JSDoc に `@remarks` として記載

## 関連

- DD-041: FlowContext snapshot 採用（syncFromInstance のタイミング）
