---
status: accepted
---

# DD-037: tramli-viz トレースモード + エッジ表現改善

**Date:** 2026-04-09

## Decision

tramli-viz に 3 つの視覚表現改善を追加する。

## Context

DD-027 tramli-viz の初期実装後、デモの視覚的品質を向上させるためにユーザーからフィードバックを受けた。

## 設計決定

### 1. 火の玉トレースモード（Trace ON/OFF）

| 項目 | 決定 | 理由 |
|------|------|------|
| アニメーション方式 | CSS `offset-path` + `offset-distance` | ライブラリ不要、GPU 加速 |
| 火の玉構造 | ヘッド 1 + テール 7 + 排気グロー 3 = 11 パーティクル | 滑らかな尾の表現 |
| テールの仕組み | 同一パス上で遅延付き複数 circle 要素 | 遅延差でトレーリング効果 |
| ヘッド色 | ステート色より明るいコア色 | 火の玉の白熱コア表現 |
| SVG フィルター | `feGaussianBlur` + `feFlood` + `feMerge` | ヘッドのグロー効果 |

### 2. 尾の長さ = 速度に比例

| 項目 | 決定 | 理由 |
|------|------|------|
| 速度計算 | ノード間距離の逆数（短距離 = 高速） | 物理的直感に合致 |
| スケーリング | `speedFactor = reference / pathLength`（0.4〜2.5 にクランプ） | 極端な値を防止 |
| テール遅延 | `delayFrac * TRANSIT_DURATION * speedFactor` | 速い遷移ほど長い尾 |
| 排気サイズ | `r * tailScale` | 速い遷移ほど大きな排気 |

### 3. スマートエッジルーティング

| 項目 | 決定 | 理由 |
|------|------|------|
| 下方向（通常） | 下辺中央 → 上辺中央のベジェ | 標準的なフローチャート |
| 上方向（ループバック） | 側面出口 → 弧 → 側面入口 | 8の字ねじれ防止 |
| 同じ高さ | 横方向にアーク | 水平遷移の自然な表現 |
| 背景 | RETRIABLE_ERROR → INIT が上方向ループで不自然な8の字になっていた |

### 4. エッジ矢印

| 項目 | 決定 | 理由 |
|------|------|------|
| マーカー | `MarkerType.ArrowClosed` | React Flow 組み込み |
| 色 | エッジタイプと同色 | 視覚的一貫性 |
| FlowNode ハンドル | 上下左右に source/target 追加 | ループバックエッジの接続点 |

## Rejected Alternatives

- framer-motion / react-spring → CSS offset-path で十分、ゼロ依存
- SVG `<animateMotion>` → React の再レンダリングと相性が悪い
- dagre 自動レイアウト → 手動レイアウトの方がデモの見栄えが良い
- 固定テール長 → 速度比例の方が物理的に自然

## 関連ファイル

- `viz/web/src/components/TraceLayer.tsx` — 火の玉 + スマートパス
- `viz/web/src/components/FlowBoard.tsx` — 矢印 + エッジルーティング
- `viz/web/src/components/FlowNode.tsx` — 4方向ハンドル
- `viz/web/src/hooks/useVizSocket.ts` — TransitAnimation 追跡
- `viz/web/src/App.css` — trace-move / trace-trail キーフレーム
