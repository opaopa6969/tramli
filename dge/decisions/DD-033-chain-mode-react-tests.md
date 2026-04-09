---
status: accepted
---

# DD-033: #19 chain mode 実装 + tramli-react テスト + v3.5.0

**Date:** 2026-04-09

## Decision

### D1: FlowEngine logger getters (3 言語) — DD-032 D3 実装

- TS: `getTransitionLogger()` / `getStateLogger()` / `getErrorLogger()` / `getGuardLogger()` 追加
- Java: 同上 (`Consumer<LogEntry.*>` を返す)
- Rust: `take_transition_logger()` / `take_state_logger()` / `take_error_logger()` / `take_guard_logger()` — 所有権移動パターン

### D2: ObservabilityPlugin append mode (3 言語)

- TS: `install(engine, { append?: boolean })` — デフォルト false (上書き)
- Java: `install(engine, boolean append)` + no-arg overload
- Rust: `install_with_options(engine, append: bool)` + `install(engine)` (既存 API 維持)
- append=true 時は既存 logger を chain (先に呼び出し → sink に emit)

### D3: tramli-react テスト基盤

- vitest + @testing-library/react + jsdom
- 7 テスト: start/auto-chain, terminal, resume, missing data, sessionId, context
- `vitest.config.ts` + `npm test` スクリプト追加

### D4: v3.5.0 バージョン bump

- 6 core/plugin パッケージ: 3.4.0 → 3.5.0
- @unlaxer/tramli-react: 0.1.0 → 0.2.0

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| TS core | 64 | passing |
| TS plugins | 24 (+2) | passing |
| tramli-react | 7 (new) | passing |
| Java core | all | passing |
| Java plugins | all (+2) | passing |
| Rust core | 16 | passing |
| Rust plugins | 17 (+2) | passing |
