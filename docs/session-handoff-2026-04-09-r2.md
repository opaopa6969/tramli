# Session Handoff — 2026-04-09 R2

## 完了したこと

### DD-026 P1 — API 対称性（全完了）

| # | タスク | 対象 |
|---|--------|------|
| 74 | `externalsFrom()` + Guard requires マッチ選択 | TS + Rust |
| 75 | `externals_from()` + Guard requires マッチ選択 | Rust |
| 76 | `onStateEnter` / `onStateExit` | TS + Rust |
| 77 | `onStepError` + context rollback + per-state timeout | Rust |

### DD-026 P1+ — 差異チェックで発見・修正

| # | タスク | 対象 |
|---|--------|------|
| 16 | `guardFailureCount` reset on `transitionTo` | TS + Rust |
| 17 | branch で `fireEnter`/`fireExit` — Java 側欠落と判断 | DD記録 |
| 18 | `FlowInstance.lastError` | Rust |
| 19 | `stateLogger` | Rust |
| 20 | `maxChainDepth` 設定可能 | Rust |
| 21 | `withPlugin()` enterActions/exitActions/exceptionRoutes コピー | TS |
| 22 | `external` with processor オーバーロード | Rust |

### DD-026 P2 — 全完了

| # | タスク | 対象 |
|---|--------|------|
| 78a | FlowContext alias API | TS |
| 78b | build() warnings (dead data, liveness, exception route) | Rust |
| 78c | allow_perpetual | Java + TS |
| 78d | per-guard failure count Map | TS + Rust |
| — | availableData / missingFor / waitingFor | Rust |

### DD-028 — Specs + 3 言語共通テスト

- `docs/specs/flow-engine-spec.md` — FlowEngine 全動作パス仕様
- `docs/specs/flow-definition-spec.md` — Builder API、validation、warnings
- `docs/specs/flow-context-spec.md` — put/get/snapshot/alias
- `docs/specs/shared-test-scenarios.md` — 30 シナリオ定義（S01-S30）
- 3 言語で SharedSpec テスト実装（16 テスト × 3 言語 = 48 テスト）

### 新規 DD

- DD-026 P1+ セクション追加（#16-#22）
- DD-028 Specs + 共通テスト

---

## テスト状況

| スイート | テスト数 | 状態 |
|---------|---------|------|
| Java core + SharedSpec | 89 | passing |
| TS core + SharedSpec | 64 | passing |
| Rust core + SharedSpec | 39 | passing |
| **合計** | **192** | **all green** |

### SharedSpec カバレッジ（16 テスト × 3 言語 = 48/48 ✅）

S06(rollback), S08(enter/exit), S09x2(exception routes), S10x2(multi-external),
S11(timeout), S14(per-guard count), S15(count reset), S17(external+proc),
S18x2(perpetual), S21(plugin/subflow), S22(plugin actions), S23(plugin exception),
S30(plugin name)

---

## 残タスク

### 設計上の差異（許容済み）

| 差異 | 備考 |
|------|------|
| Rust withPlugin | SubFlowRunner で代替 |
| Rust sub-flow resume | SubFlowRunner パターン |
| Rendering (RenderableGraph) | DD-027 scope |

### DD-027 tramli-viz（未着手）

### Maven Central
v3.1.0 は欠番。次の feature リリースでまとめて出す。
