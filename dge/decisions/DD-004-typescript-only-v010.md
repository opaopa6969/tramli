# DD-004: v0.1.0 の移植対象は TypeScript のみ

**Date:** 2026-04-07
**Session:** [multilang-strategy](../sessions/2026-04-07-tramli-multilang-strategy.md)
**Gap:** #5 (移植対象言語の優先度)

## Decision

v0.1.0 では TypeScript のみ移植する。Rust / Python / C# は需要が発生した時点で検討する。

## Rationale

プロジェクト構成（TS 15件、Python 3件、Rust 1件、C# 1件）から、TypeScript が唯一の即時需要。takt（エージェントオーケストレーション）と AskOS（ポートフォリオ管理）にフロー制御の統合余地がある。

- Python: フロー制御の需要なし（ユーティリティ/CLI 系）
- Rust: 言語親和性は高いが使う場所がない（syslenz はシステム監視）
- C#: プロジェクト 1 件（Windows 専用）

鷲津: 「ROI が合うのは TypeScript だけだ」
ヤン: 「使う場所がある言語だけでいい」

## Alternatives considered

- **TypeScript + Rust 同時**: Rust はコンパイル時保証が活きるが、具体的な統合先がない。需要駆動で判断する方が効率的。
