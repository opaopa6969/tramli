---
status: accepted
---

# DD-039: tramli-viz レイアウト永続化 + UX 改善

**Date:** 2026-04-09

## Decision

tramli-viz にレイアウト永続化、ハンドル操作、軌跡スライダー、stale フロークリーンアップを追加する。

## Context

DD-038 のヒートマップ軌跡実装後、ユーザーフィードバックにより以下の課題が判明:
- 軌跡パスとエッジパスがずれる（別々の SVG 計算のため）
- 軌跡の残留時間を調整したい
- RETRIABLE_ERROR に車が残り続ける
- ハンドル（線の接続点）を付け替えたい
- ノード位置を保存したい

## 設計決定

### 1. Heat glow をエッジ自体に統合

| 項目 | 決定 | 理由 |
|------|------|------|
| 方式 | 別 SVG (HeatLayer) を廃止、React Flow エッジの strokeWidth + drop-shadow で直接描画 | パスのずれがゼロになる |
| strokeWidth | `1.5 + (heat/3) * 5` | heat=3 で最大幅 |
| drop-shadow | `drop-shadow(0 0 ${3 + intensity*8}px ${color})` | heat > 0.08 で適用 |
| transition | `stroke-width 200ms, filter 200ms` | 滑らかな変化 |

### 2. 軌跡時間ドロップダウン (Trail)

| 項目 | 決定 | 理由 |
|------|------|------|
| UI | ヘッダーにドロップダウン 13段階: 0.5s〜1day | 低トラフィックサイト（1日単位）にも対応 |
| 選択肢 | 0.5s, 1s, 1.5s, 2s, 5s, 10s, 30s, 1min, 5min, 30min, 1h, 6h, 1day | 対数的にカバー |
| 計算 | `decay = 0.05^(1/(seconds*10))` — N 秒後に閾値以下に減衰 | 数学的に正確な半減期制御 |
| heat 上限 | 50 にキャップ | 長時間 trail で decay ≈ 1.0 でも無限積算を防止 |
| デフォルト | 1.5 秒 | 速い遷移でも軌跡が見える、遅すぎない |
| 実装 | useRef で decay 値を保持、tick ごとに参照 | reducer の再生成不要 |

### 3. Stale フロークリーンアップ

| 項目 | 決定 | 理由 |
|------|------|------|
| terminal ステート | 3 秒後に flowPositions から削除 | 到着アニメーション後に自然消滅 |
| 非 terminal ステート | 15 秒間遷移なしで削除 | RETRIABLE_ERROR 等で詰まった車を解消 |
| 追跡 | flowLastActive: Map<flowId, timestamp> | 最後の遷移時刻で判定 |
| タイミング | tick (100ms) 内で判定 | 既存の定期処理に統合 |

### 4. エッジハンドル切り替え

| 項目 | 決定 | 理由 |
|------|------|------|
| 操作 | ダブルクリック = ターゲット側、右クリック = ソース側 | 片手で完結、直感的 |
| サイクル | default(上下) → left → right → default | 3 段階で十分 |
| 自動検出 | ノード位置関係から初期ハンドルを自動推定 | ループバック等の合理的デフォルト |
| オーバーライド | handleOverrides: Map<edgeKey, {source, target}> | ユーザー指定が自動検出を上書き |

### 5. レイアウト永続化 (Save Layout)

| 項目 | 決定 | 理由 |
|------|------|------|
| ストレージ | localStorage | サーバー不要、即座に使える |
| キー | `tramli-viz-layout` | 単一フロー想定 |
| 保存内容 | ノード位置 + ハンドルオーバーライド | レイアウトの完全復元 |
| 操作 | キャンバス右上「Save Layout」ボタン | 明示的保存（自動保存は誤操作リスク） |
| 復元 | マウント時に自動読み込み | 次回起動で前回レイアウトが即復元 |

## Rejected Alternatives

- 別 SVG レイヤーでの軌跡描画 → エッジとのずれが不可避
- 自動保存（onChange ごと） → ドラッグ中の中間状態が保存されるリスク
- ハンドル付け替えの専用モーダル → 操作が重い、ダブルクリック/右クリックで十分
- IndexedDB / サーバー保存 → デモ用途では localStorage で十分

## 関連ファイル

- `viz/web/src/components/FlowBoard.tsx` — ハンドル切り替え、Save、heat on edge
- `viz/web/src/hooks/useVizSocket.ts` — flowLastActive、設定可能 heatDecay、cleanup
- `viz/web/src/App.tsx` — Trail スライダー UI
