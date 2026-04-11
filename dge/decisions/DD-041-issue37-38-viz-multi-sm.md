---
status: accepted
---

# DD-041: Issue #37 multi-SM viz + Issue #38 BOM / plugins バージョン

**Date:** 2026-04-11

## Context

- Issue #37: tramli-viz を単一フローデモから本番 multi-SM 監視ツールに進化させたい
- Issue #38: volta-auth-proxy 3.7.1 フィードバック。plugins バージョン乖離 + BOM pom 要望

## Issue #38 判定

### plugins バージョン乖離

**事実確認**: plugins は既に 3.7.1 に上げ済み（npm publish 済み）。Issue 投稿者の認識が古い。

**対応**: コメントで回答するのみ。

### BOM pom

**判定: NOT-DOING（現時点）**

| 項目 | 決定 | 理由 |
|------|------|------|
| BOM | 作らない | tramli は Java / TS / Rust の 3 言語。BOM は Java 固有の概念 |
| バージョン同期 | 3 言語 + plugins を同一バージョンで publish する運用で対応 | v3.7.1 から実施済み |
| 将来 | java-plugins が増えたら BOM 検討 | 現在 Java plugins は未 publish |

## Issue #37 判定

### Phase 1: Multi-SM Layout

**判定: 採用（段階的）**

| 項目 | 決定 | 理由 |
|------|------|------|
| protocol | `init-multi` + `FlowDefinition[]` | 既に protocol.ts に追加済み |
| レイアウト | React Flow グループノードで SM ごとに囲む | xyflow 標準機能 |
| Layer 1/2 | Session SM を上部、Flow SM を下部グリッド | 直感的な階層表現 |
| 層間接続 | Flow 完了 → Session 遷移のクロスエッジ | 実運用で必須 |
| 優先度 | 高 — auth-proxy 統合の前提条件 |

### Phase 2: npm パッケージ化

**判定: 採用**

| 項目 | 決定 | 理由 |
|------|------|------|
| パッケージ名 | `@unlaxer/tramli-viz` | monorepo 内 viz/ |
| エクスポート | `VizDashboard`, `VizCanvas`, `LiveFeed`, `MetricsBar` | コンポーザブル |
| private 解除 | `"private": false` + proper exports | npm publish 可能に |
| 優先度 | 中 — Phase 1 完了後 |

### Phase 3: リプレイ + テナントフィルタ + Redis

**判定: 保留**

| 項目 | 決定 | 理由 |
|------|------|------|
| Redis subscribe | 将来 | 現在 in-process で十分 |
| テナントフィルタ | protocol に `tenantSlug` は追加済み | UI フィルタは需要確認後 |
| リプレイ | 既存のクライアントサイドリプレイで MVP は満たしている |

## 実装順序

1. Issue #38 にコメント回答
2. Phase 1: multi-SM layout 実装
3. Phase 2: npm パッケージ化
