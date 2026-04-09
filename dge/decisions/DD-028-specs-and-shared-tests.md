---
status: accepted
---

# DD-028: 実装からの Specs 抽出 + 3 言語共通テスト

**Date:** 2026-04-09

## Decision

現在の Java 実装（リファレンス）から仕様書（specs）を抽出し、3 言語（Java/TS/Rust）で同じ仕様・同じ挙動を検証する共通テストシナリオを定義する。

## Context

DD-026 で P0〜P2 の API 対称性を全て解消した。しかし「同じ入力に対して同じ出力になるか」を体系的に検証するテストがない。specs を先に作り、テストの根拠とする。

## Format

- **specs**: `docs/specs/` に Markdown で格納。FlowEngine の全動作パスをカバー
- **shared test scenarios**: specs 内にテストケースを定義（入力→期待出力）
- 各言語のテストコードで shared scenarios を実装

## Specs 構成

1. `flow-engine-spec.md` — startFlow, resumeAndExecute, autoChain, subFlow, error handling
2. `flow-definition-spec.md` — Builder API, validation (8 checks), warnings
3. `flow-context-spec.md` — put/get/has, snapshot/restore, alias
4. `guard-and-timeout-spec.md` — guard validation, multi-external, per-state timeout
5. `enter-exit-actions-spec.md` — fireEnter/fireExit timing, all transition types

## Implementation Order

1. Java 実装から specs 抽出
2. specs から shared test scenarios 定義
3. 各言語でテスト実装
