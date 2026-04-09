---
status: accepted
---

# DD-038: tramli-viz ヒートマップ軌跡 + 表示改善

**Date:** 2026-04-09

## Decision

tramli-viz に 4 つの表示改善を追加する。

## Context

DD-037 のトレースモード実装後、ユーザーフィードバックにより追加の視覚表現と UX 改善を実施。

## 設計決定

### 1. ヒートマップ軌跡（エッジの残光）

| 項目 | 決定 | 理由 |
|------|------|------|
| 仕組み | edgeHeat: Map<"from->to", number> を reducer で管理 | リアルタイム積算と減衰 |
| 積算 | 遷移イベントごとに heat += 1 | 通過頻度を反映 |
| 減衰 | tick ごとに heat *= 0.88（半減期 ~1秒） | 1秒程度で消える自然な残光 |
| 描画 | 2層: 外側ぼかし glow + 内側ブライトパス | 柔らかい光の軌跡 |
| スケーリング | width = 2 + (heat/4) * 8, opacity = 0.1 + (heat/4) * 0.5 | heat=4 で最大、飽和防止 |
| 色 | エラーパス = 赤、通常パス = 青 | 直感的な視覚区別 |

### 2. ノード通過数表示

| 項目 | 決定 | 理由 |
|------|------|------|
| 位置 | ノード左下の小バッジ | アクティブ数バッジ（右上）と干渉しない |
| スタイル | 暗背景 + グレー文字 + 細枠、9px | 控えめだが読める |
| カウント方法 | nodeCounts: Map<state, number>、遷移先のカウントを加算 | INIT = リクエスト数に相当 |

### 3. 完了フローの自動クリーンアップ

| 項目 | 決定 | 理由 |
|------|------|------|
| 対象 | terminal ステートにいるフロー | 完了済みの車が溜まる問題 |
| タイミング | フロー開始から 5秒後に flowPositions から削除 | 到着アニメーション後に自然消滅 |
| 実装箇所 | tick アクション内で判定 | 既存の定期処理に統合 |

### 4. TERMINAL_ERROR エッジの可視化

| 項目 | 決定 | 理由 |
|------|------|------|
| 問題 | onAnyError() は暗黙のエラー遷移だがエッジ定義に含まれていなかった |
| 対応 | INIT, REDIRECTED, USER_RESOLVED, RISK_CHECKED, RETRIABLE_ERROR → TERMINAL_ERROR の error エッジを明示追加 |
| CALLBACK_RECEIVED, TOKEN_EXCHANGED は対象外 | これらは RETRIABLE_ERROR への専用 onError がある |

## 追加修正

- Active Flows リストのスクロール修正（overflow: auto）
- terminal ステートの車を TraceLayer で非表示（到着数はノードバッジで確認可能）

## 関連ファイル

- `viz/web/src/components/HeatLayer.tsx` — 新規: ヒートマップ軌跡描画
- `viz/web/src/components/FlowNode.tsx` — throughput バッジ追加
- `viz/web/src/hooks/useVizSocket.ts` — edgeHeat, nodeCounts, フロークリーンアップ
- `viz/web/src/components/FlowBoard.tsx` — HeatLayer 統合
- `viz/demo/simulator.ts` — TERMINAL_ERROR エッジ 5 本追加
