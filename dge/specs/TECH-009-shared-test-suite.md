<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-009: 共有テストスイート

**Status:** draft
**Session:** [multilang-r3](../sessions/2026-04-07-tramli-multilang-r3.md)

## 概要

言語横断の振る舞い一致を保証する YAML ベースのテストケース。

## 配置

Java リポ `tramli/shared-tests/cases/*.yaml` をソースオブトゥルース。
TS リポにコピー管理（CI で同期）。

## YAML フォーマット

```yaml
name: test-case-name
description: "What this tests"

states:
  STATE_NAME: { terminal: bool, initial: bool }

transitions:
  - { from: STATE, to: STATE, type: auto|external|branch }

error_transitions:
  STATE: ERROR_STATE    # or _any: ERROR_STATE

ttl: PT24H              # ISO 8601 duration
max_guard_retries: 3

# バリデーション失敗テスト用
expect_build_error: true
expect_error_contains: "substring"

# シナリオテスト用
scenarios:
  - name: scenario-name
    initial_data:
      TypeName: { field: value }
    steps:
      - action: start|resume
        guard_decision: accepted|rejected|expired  # resume 時
        guard_produces:                             # accepted 時
          TypeName: { field: value }
        expect_state: STATE
        expect_completed: true|false
        expect_exit_state: STATE
        expect_context_has: [TypeName, ...]
```

## テストケース一覧 (14)

### シナリオテスト (5)
1. `order-happy-path.yaml` — 基本フロー: start → auto → external → auto → complete
2. `order-payment-rejected.yaml` — guard rejection → maxRetries → error state
3. `order-ttl-expired.yaml` — TTL 超過 → EXPIRED
4. `error-processor-throws.yaml` — processor 例外 → context restore → error state
5. `error-unknown-branch.yaml` — branch 未知ラベル → error state

### バリデーションテスト (9)
6. `validation-no-initial-state.yaml`
7. `validation-unreachable-state.yaml`
8. `validation-no-path-to-terminal.yaml`
9. `validation-dag-cycle.yaml`
10. `validation-external-uniqueness.yaml`
11. `validation-branch-completeness.yaml`
12. `validation-requires-produces.yaml`
13. `validation-auto-external-conflict.yaml`
14. `validation-terminal-outgoing.yaml`

## テストハーネス

各言語で実装:
1. YAML パース → フロー定義構築（Builder → build()）
2. シナリオ実行（start/resume + guard モック）
3. アサーション（state, completed, context keys）

### TypeScript ハーネス
- `tests/shared/harness.ts` — YAML → FlowDefinition 変換 + モックガード生成
- `tests/shared/shared-tests.test.ts` — vitest で cases/*.yaml を parameterized 実行
- 依存: `yaml` パッケージ (devDependency)

### Java ハーネス (v0.2.0)
- SnakeYAML + JUnit 5 @ParameterizedTest
