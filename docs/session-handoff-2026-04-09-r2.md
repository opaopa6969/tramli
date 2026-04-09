# Session Handoff — 2026-04-09 R2

## 完了したこと

### v3.2.0 リリース（6パッケージ全 publish）

| パッケージ | レジストリ | 状態 |
|-----------|-----------|------|
| @unlaxer/tramli 3.2.0 | npm | published |
| @unlaxer/tramli-plugins 3.2.0 | npm | published |
| tramli 3.2.0 | crates.io | published |
| tramli-plugins 3.2.0 | crates.io | published |
| org.unlaxer:tramli 3.2.0 | Maven Central | published |
| org.unlaxer:tramli-plugins 3.2.0 | Maven Central | published |

### DD-026 全完了（P0 → P1 → P1+ → P2）

**P1 — API 対称性:**
- externalsFrom + multi-external guard requires マッチ (TS, Rust)
- onStateEnter/onStateExit (TS, Rust)
- onStepError + context rollback + per-state timeout (Rust)

**P1+ — 差異チェックで発見・修正:**
- guardFailureCount reset on transitionTo (TS, Rust)
- branch で fireEnter/fireExit — Java 側欠落と判断 (DD-026 #17)
- lastError, stateLogger, maxChainDepth (Rust)
- withPlugin copies enterActions/exitActions/exceptionRoutes (TS)
- external_with_processor overload (Rust)

**P2 — あると良い:**
- per-guard failure count Map (TS, Rust)
- FlowContext alias API (TS)
- build() warnings (Rust)
- allowPerpetual (Java, TS)
- availableData/missingFor/waitingFor (Rust)

**pipeline.ts fix:** flowName を logger entries に追加（DD-026 P0 followup）

### DD-028 — Specs + 3 言語共通テスト

- `docs/specs/flow-engine-spec.md` — FlowEngine 全動作パス仕様
- `docs/specs/flow-definition-spec.md` — Builder API、validation、warnings
- `docs/specs/flow-context-spec.md` — put/get/snapshot/alias
- `docs/specs/shared-test-scenarios.md` — 30 シナリオ定義（S01-S30）
- 3 言語 SharedSpec テスト: 16 テスト × 3 言語 = 48 テスト、全シナリオ全言語カバー

---

## テスト状況

| スイート | テスト数 | 状態 |
|---------|---------|------|
| Java (core + SharedSpec) | 89 | passing |
| TS (core + SharedSpec) | 64 | passing |
| Rust (core + SharedSpec) | 39 | passing |
| **合計** | **192** | **all green** |

---

## DD 記録

| DD | 内容 | 状態 |
|----|------|------|
| DD-026 | 3 言語実装差異の解消（P0-P2 + P1+） | accepted, 全完了 |
| DD-028 | Specs 抽出 + 3 言語共通テスト | accepted, 全完了 |

---

## 次セッション: DD-027 tramli-viz

リアルタイム監視デモ。DD-026 完了が前提条件（達成済み）。

### 構成

```
viz/
├── server/    → TS WebSocket サーバー + VizSink プラグイン
├── web/       → React + React Flow (xyflow)
└── demo/      → OIDC シミュレーター
```

### デモシナリオ（9種）

Auto chain, External, Branch, Guard reject, Error, SubFlow, Idempotency, Compensation, Historical replay

### キーファイル

- DD-027 設計: `dge/decisions/DD-027-tramli-viz.md`
- TS エンジン + プラグイン: `ts/src/`, `ts-plugins/src/`
- ObservabilityPlugin が VizSink のベース

---

## 設計上の差異（許容済み）

| 差異 | 備考 |
|------|------|
| Rust withPlugin | SubFlowRunner で代替 |
| Rust sub-flow resume | SubFlowRunner パターン |
| Rendering (RenderableGraph) | DD-027 scope |

---

## Maven Central メモ

v3.2.0 は全て published。CLI では autoPublish 失敗と報告されるが Central portal 上では正常に publish されている。GPG agent バージョン差異の警告が原因（gpg-agent 2.2.27 < 2.4.7）。実害なし。
