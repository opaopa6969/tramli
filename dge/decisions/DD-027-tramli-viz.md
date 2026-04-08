---
status: accepted
---

# DD-027: tramli-viz — リアルタイムフロー監視デモ

**Date:** 2026-04-09

## Decision

tramli の monorepo 内に `viz/` ディレクトリを作成し、リアルタイムフロー監視 UI を構築する。

## Context

- tramli の「レールの上を走る」メタファーを視覚化するマーケティング＋開発ツール
- DGE セッションで設計を検討

## 設計決定

| 項目 | 決定 | 理由 |
|------|------|------|
| 位置づけ | デモ + 開発ツール | 本番監視は別スコープ |
| リポ構成 | monorepo `viz/` | 汎用ツール（開発者が自分のフローを見れる） |
| データソース | VizSink プラグイン | プラグイン作成の教材も兼ねる |
| フロー図 | React Flow (xyflow) | ノード/エッジ/ズーム/パン組み込み、Star 25k+ |
| アニメーション | ノード座標補間 + ease | 滑らか重視 |
| スコープ | フル（ヒストリカルリプレイ含む） | デモの完成度を最大化 |
| デモシナリオ | OIDC ベース + SubFlow + Idempotency | 全パターン網羅 |

## デモで網羅するパターン

| パターン | 視覚表現 |
|---------|---------|
| Auto chain | 車が連続でノード間を移動 |
| External (Guard) | 車が停止、webhook で動く |
| Branch | 車が分岐点で別ルートに分かれる |
| Guard Rejected | 車がバウンスして戻る |
| Error transition | 赤い車が CANCELLED に飛ぶ |
| SubFlow | 車がミニフロー内に入って出てくる |
| Idempotency | 同じ commandId で 2 台目が即消える |
| Compensation | 失敗した車に補償イベント発生 |
| Historical replay | スライダーで時間を巻き戻して再生 |

## 技術スタック

```
viz/
├── server/          → TypeScript、WebSocket サーバー
│   └── viz-sink.ts  → TelemetrySink 実装 → WS broadcast
├── web/             → React + React Flow (xyflow)
│   ├── FlowBoard.tsx  → ステート図 + アニメーション
│   ├── CarPool.tsx    → flow instance の車管理
│   ├── Metrics.tsx    → throughput / error / latency
│   └── Replay.tsx     → ヒストリカルリプレイ UI
└── demo/            → OIDC シミュレーター（ランダムセッション生成）
```

## 前提条件

DD-026 (3言語実装差異の解消) が先。特に:
- P0: TS/Rust のロガー配線（viz のデータソース）
- P1: externalsFrom / Guard 選択（デモシナリオに必要）

## Rejected Alternatives

- 別リポ (`tramli-viz`) → monorepo の方が依存管理が楽
- Mermaid SVG 上のアニメーション → SVG path 上のモーション制御が困難
- CSS Grid レイアウト → インタラクティブ性が低い
- dagre + D3 Canvas → React Flow が同等機能を組み込みで提供
