---
status: accepted
---

# DD-014: data-flow は定義するのではなく導出する

**Date:** 2026-04-07

## Decision

data-flow を別途定義する仕組みは作らない。processor の `requires()/produces()` から自動導出する。可視化が必要なら MermaidGenerator に data-flow モードを追加して自動生成する。

## Rationale

- `checkRequiresProduces` がビルド時に data-flow 整合性を検証済み。明示定義なしで正しさは保証されている
- 明示的 data-flow 定義を入れると requires/produces と同じ情報を2箇所で書くことになる（DRY 違反）
- 「定義から自動生成」が tramli の哲学（MermaidGenerator と同じアプローチ）

## 将来の検討

MermaidGenerator に data-flow 可視化モードを追加:
```
OrderRequest → [OrderInit] → PaymentIntent → [PaymentGuard] → PaymentResult → [ShipProcessor] → ShipmentInfo
```
状態遷移図とは別に、データの流れを図示する。
