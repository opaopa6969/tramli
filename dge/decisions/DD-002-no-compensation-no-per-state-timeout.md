# DD-002: 補償機構と per-state タイムアウトは v0.1.0 に入れない

**Date:** 2026-04-07
**Session:** [tramli-design-review-r3](../sessions/2026-04-07-tramli-design-review-r3.md)
**Gap:** #11 (補償機構の欠如), #13 (per-state タイムアウト設定の欠如)

## Decision

Saga パターンの補償ステップとステートごとのタイムアウト/リトライ設定は v0.1.0 のスコープ外とする。v0.2.0 以降で検討する。

## Rationale

tramli の設計哲学は「制約で正しさを保証する」。補償や per-state タイムアウトは正しさの保証ではなく機能の拡張であり、120行のエンジンが膨張する。

**補償**: error state の processor が補償ロジックを実行すれば近似可能。エンジンが補償を知る必要はない。Spring State Machine も Temporal も補償は別レイヤー。

**Per-state タイムアウト**: TransitionGuard が `Instant.now()` を見て業務的な期限を判断し `GuardOutput.Expired` を返せば近似可能。「決済待ち30分」は guard の責務。

ヤン: 「tramli の本分は不正な遷移を防ぐこと。それ以上を盛ると120行が300行になる」  
金八: 「何を入れないかを決めることも設計だ」  
ビーン: 「OSS で補償を v1.0 前に入れたものは少ない」

## Alternatives considered

- **DSL に compensation step を追加**: 表現力は上がるが、エンジンの複雑度が倍増。v0.1.0 の「小さくて正しい」方針に反する。
- **Transition ごとに timeout Duration を持たせる**: FlowEngine にタイマー管理が必要になり、スレッドモデルの前提が変わる。
