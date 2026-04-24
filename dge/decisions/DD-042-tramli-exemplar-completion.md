# DD-042: tramli は state-machine + data-flow の exemplar として完結させる

**Date:** 2026-04-24
**Sessions:**
- [DataFlow Mode](../sessions/2026-04-24-tramli-dataflow-mode.md)
- [Reactive & App Structure](../sessions/2026-04-24-tramli-reactive-and-app-structure.md)

## Decision

tramli 本体は **「有限状態 Statechart + 型付き data-flow overlay」** の exemplar として完結させる。
以下の拡張は tramli 本体には入れない:

- `define.stateless()` / 単一ステートシュガー（期待ギャップを生むため）
- 並行合成・メッセージパッシング・セッション型
- 長寿命・再入・backpressure などの Reactive 層機能

## Rationale

- tramli の設計美学は「define を読めばドメインが見える」こと。Reactive プリミティブを
  混ぜると抽象レベルが破綻し、両者の明瞭さが死ぬ（深澤視点）
- 理論的に Reactive 層は π-calculus 系譜であり、Statechart の拡張ではない独立領域（Milner 視点）
- Harel 自身、Statechart だけで全てを書こうとはせず後年 LSC で補完した。同じ判断を tramli でも取る
- 期待ギャップを作らないために、tramli は state-machine + data-flow の範囲内で完結することを
  SPEC に明記する

## Implication

- 可視化の Option C（Mermaid dataflow view）は本 DD の制約内で実施可能（tramli の意味論は変えない）
- 通信プログラム向けの拡張は **tramli-reactive** として別パッケージで扱う（DD-043 参照）

## Alternatives considered

- `define.stateless()` シュガー追加 → 却下（期待ギャップ、ユーザーが通信プログラムに誤用する）
- tramli 本体に Reactive API を増設 → 却下（抽象レベル混在、DD-021 の flat+data-flow 原則と衝突）
