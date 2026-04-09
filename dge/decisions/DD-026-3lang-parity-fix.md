---
status: accepted
---

# DD-026: 3 言語実装差異の解消

**Date:** 2026-04-09

## Decision

Java を正（リファレンス実装）として、TypeScript と Rust の実装差異を全て解消する。

## Context

DGE で tramli-viz（リアルタイム監視デモ）を設計中に、TS/Rust エンジンのロガー呼び出しが未実装であることが発覚。調査の結果、ロガー以外にも複数の機能差異が存在。

## 差異一覧と対応

### P0 — viz 前提条件 / コア品質

| # | 機能 | Java | TS | Rust | 対応 |
|---|------|------|----|------|------|
| 1 | transitionLogger 呼び出し | 全遷移で呼ぶ | 宣言のみ | 宣言のみ | TS/Rust: 全遷移箇所で呼ぶ |
| 2 | errorLogger 呼び出し | 全エラーで呼ぶ | 1箇所のみ | 宣言のみ | TS: 全箇所、Rust: 追加 |
| 3 | stateLogger 呼び出し | context.put()で呼ぶ | 宣言のみ | なし | TS: 呼ぶ、Rust: 追加 |
| 4 | guardLogger | あり | なし | なし | TS/Rust: 追加 + 呼ぶ |
| 5 | LogEntry に flowName | あり | なし | なし | TS/Rust: LogEntry 型に追加 |

### P1 — API 対称性

| # | 機能 | Java | TS | Rust | 対応 |
|---|------|------|----|------|------|
| 6 | externalsFrom() | あり | なし | なし | TS/Rust: 追加 |
| 7 | Guard requires マッチ選択 | あり | なし | なし | TS/Rust: resumeAndExecute に選択ロジック追加 |
| 8 | onStateEnter / onStateExit | あり | なし | なし | TS/Rust: Builder + Engine に追加 |
| 9 | onStepError (例外型ルーティング) | あり | あり | なし | Rust: 追加 |
| 10 | context rollback on error | あり | あり | なし | Rust: snapshot/restore 追加 |
| 11 | per-state timeout | あり | あり | なし | Rust: Transition に timeout フィールド追加 |

### P2 — あると良い

| # | 機能 | Java | TS | Rust | 対応 |
|---|------|------|----|------|------|
| 12 | FlowContext alias | あり | なし | あり | TS: registerAlias/toAliasMap 追加 |
| 13 | warnings() in build() | あり | あり | なし | Rust: 追加 |
| 14 | per-guard failure count | あり | aggregate のみ | aggregate のみ | TS/Rust: Map 追加 |
| 15 | allow_perpetual | なし | なし | あり | Java/TS: 追加（perpetual フロー対応） |

### P1+ — P1 実装中に発見した追加差異

| # | 機能 | Java | TS | Rust | 決定 |
|---|------|------|----|------|------|
| 16 | guardFailureCount reset on transitionTo | state 変更時 0 リセット | リセットなし | リセットなし | TS/Rust: Java に合わせてリセットする |
| 17 | branch 遷移で fireEnter/fireExit | 呼ばない | 呼ぶ | 呼ぶ | **Java 側の欠落と判断**。TS/Rust の現状（fire する）を正とし、将来 Java を修正する。理由: branch も状態遷移であり auto/external と区別する合理的理由がない |
| 18 | FlowInstance.lastError | あり | あり | なし | Rust: 追加 |
| 19 | stateLogger | あり | あり | なし | Rust: 追加 |
| 20 | maxChainDepth 設定 | コンストラクタ引数 | options 引数 | ハードコード | Rust: コンストラクタ引数に変更 |
| 21 | withPlugin() が enterActions/exitActions/exceptionRoutes をコピー | あり | コピー漏れ | N/A (SubFlowRunner) | TS: コピーを追加 |
| 22 | external with processor オーバーロード | あり | あり | なし | Rust: external_with_processor / external_with_processor_and_timeout 追加 |

## 実装方針

- Java のコードを正として、TS/Rust を合わせる
- テストも Java のテストパターンを各言語に移植
- 既存テストが壊れないことを確認（後方互換）
- P0 → P1 → P2 の順に実装
- **例外**: #17 branch fireEnter/fireExit は Java 側の欠落と判断。TS/Rust の動作を正とする
