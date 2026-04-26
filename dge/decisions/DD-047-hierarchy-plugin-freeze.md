---
status: accepted
---

# DD-047: hierarchy plugin — LCA ランタイム実装を凍結、ユースケース待ち

**Date:** 2026-04-10
**Session:** [Issue #30 DGE](../sessions/2026-04-10-issue30-33-8-dge.md)
**Issues:** #8

## Decision

`hierarchy plugin` への LCA（Least Common Ancestor）ランタイムセマンティクスの追加を**凍結**する。
「LCA が必要な具体的ユースケース」が提示されるまで着手しない。
`#8` は凍結理由を記載してクローズする。

## Rationale

- **DD-021（Flat is Correct）との矛盾**: Harel Statechart へのデータフロー検証適用実験で「super-state 遷移が implicit path を生む」ことが確認済み。LCA ランタイムを hierarchy plugin に追加すると同じ問題が発生し、tramli コアの 8-item validation と整合しなくなる恐れがある。
- **ユースケース不在**: `#8` に「誰が、どのシナリオで LCA を必要とするか」の記載がない。「Low priority で出てから着手」という曖昧な状態が続いており、実装着手の判断基準が存在しない。
- **メンテナンス負債**: flat 設計原則と相反するプラグインが半完成状態で存在し続けると、コアの破壊的変更のたびにブロッカーになる。
- **event bubbling の停止条件も未設計**: LCA に加えて bubbling の `stopPropagation` 相当 API、exit/entry の非同期失敗時挙動なども未定義であり、設計コストが高い。

## NOT-DOING（当面）

- LCA 計算ロジックの実装
- event bubbling API の設計
- exit/entry アクション順序の規定

## 着手条件（解除トリガー）

以下が揃った場合に本 DD を再検討する：

1. **具体的ユースケース**: 「フロー X のシナリオ Y で LCA が必要」という実例
2. **DD-021 との整合性検証**: LCA 遷移がデータフロー検証に与える影響の分析
3. **flat 設計で解決できない理由**: サブフロー（DD-017）や entry/exit（DD-020）で代替できないことの確認

## 関連

- DD-021: Flat Enum は正しい設計（Carta/Tenure 検証）
- DD-017: Flow Composition（サブフロー）
- DD-020: Multi-External + Entry/Exit Actions
