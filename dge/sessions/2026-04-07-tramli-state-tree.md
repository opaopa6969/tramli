# DGE Session: State Tree — 階層的状態の設計

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review
- **Structure**: 🗣 座談会
- **Characters**: ☕ ヤン, 👤 今泉, ⚔ リヴァイ, 🎩 千石
- **Input**: 現行の flat state 設計, ユーザーモチベーション（大規模システム, プラグイン）

## 結論

3 案を検討した結果、**案 C: Flow Composition（サブフロー）** を採用。

- 案 A (Harel Statechart): 却下 — 機能過多、tramli の哲学と矛盾
- 案 B (ドット記法): 不要 — 案 C + Mermaid 側のグルーピングで代替
- 案 C (Flow Composition): 採用 — enum を閉じたまま拡張可能、data-flow 検証が自然に統合

## API イメージ

```java
// メインフロー
.from(PAYMENT).subFlow(paymentSubFlow)
    .onExit("DONE", PAYMENT_DONE)
    .onExit("CANCELLED", CANCELLED)

// プラグイン (v1.3.0)
var extended = main.withPlugin("CONFIRMED", "SHIPPED", giftWrapFlow);
```

## Gap 一覧

| # | Gap | Category | Severity |
|---|-----|----------|----------|
| G1 | flat state では状態グルーピングが構造的に表現できない | Missing logic | High |
| G2 | enum 安全 vs string 拡張の二項対立 | Spec-impl mismatch | High |
| G3 | Harel Statechart は機能過多 | Integration gap | Medium |
| G4 | 親レベル遷移の意味論が未定義 | Missing logic | Medium |

## アイデア一覧

| # | アイデア | 分類 |
|---|---------|------|
| A1 | Flow Composition — サブ FlowDefinition 埋め込み | 設計方針 |
| A2 | onExit mapping — terminal → parent state | API 設計 |
| A3 | withPlugin — 遷移間にサブフロー挿入 | API 設計 |
| A4 | 表示グルーピングは Mermaid 側（コア変更なし） | 方針 |

## ロードマップ

- v1.2.0: SubFlowTransition, onExit, data-flow 結合検証, Mermaid subgraph
- v1.3.0: withPlugin API, プラグイン data-flow 検証

## Round 2: 実行モデル詳細

### 決定事項
- Context: 完全共有（同じ FlowContext）
- エラー: 3 層（サブ内解決 → error terminal → 親バブリング）
- FlowInstance: activeSubFlow フィールド追加。外部 currentState は親の状態
- Engine: auto-chain 再帰実行、depth 全体合算（max 10）、resume はアクティブサブフローに委譲
- ビルド検証: onExit 網羅性 / data-flow 結合 / onExit 先 valid
- Mermaid: subgraph ネスト描画

### 追加アイデア
| # | アイデア |
|---|---------|
| A5 | Context 完全共有 |
| A6 | エラー 3 層（サブ内 → terminal → 親バブリング） |
| A7 | FlowInstance.activeSubFlow |
| A8 | auto-chain 再帰 + depth 合算 + resume 委譲 |
| A9 | SubFlow ビルド検証 3 項目 |
| A10 | Mermaid subgraph ネスト |

## Round 3: 境界条件と実運用

### 決定事項
- 永続化: statePath `["PAYMENT", "CONFIRM"]` で状態パスを保存。restore 時に再構築
- ネスト制限: max nesting depth = 3（ビルド時検証）
- TTL: 親が支配。サブフローの ttl は埋め込み時に無視
- TransitionRecord: subFlow フィールド追加（null = メイン）
- テスト: 3 層（サブフロー単体 / 結合 / data-flow 検証）
- 既存 API: 影響ゼロ（全て additive）

### 実装順序
1. SubFlowTransition 型 + Builder .subFlow().onExit()
2. ビルド検証（onExit 網羅 / nesting depth / data-flow 結合）
3. FlowInstance.activeSubFlow + statePath
4. FlowEngine auto-chain 再帰 + resume 委譲
5. TransitionRecord.subFlow フィールド
6. MermaidGenerator subgraph
7. テスト（3 層）

### 追加アイデア
| # | アイデア |
|---|---------|
| A11 | statePath 永続化 |
| A12 | max nesting depth = 3 |
| A13 | TTL は親が支配 |
| A14 | TransitionRecord.subFlow フィールド |
| A15 | 3 層テスト戦略 |
| A16 | 既存 API 影響ゼロ確認 |

## Round 4: 死角の発見

### 決定事項
- FlowInstance.waitingFor(): 待機中 external の requires を返す API 追加
- 型パラメータ: Java 型消去 / Rust trait object (SubFlow trait) / TS 自然対応
- 条件付きサブフローは branch + subFlow の組み合わせ（専用 API 不要）
- DataFlowGraph: 内部フラット化で分析、subFlowGraph(name) で部分取得
- サブフロー re-entry: 毎回 fresh start (initial state から)
- TS async: 自然に共存

### 追加アイデア
| # | アイデア |
|---|---------|
| A17 | FlowInstance.waitingFor() |
| A18 | Rust SubFlow trait |
| A19 | 条件付き subFlow は branch + subFlow |
| A20 | DataFlowGraph 内部フラット化 + subFlowGraph(name) |
| A21 | サブフロー re-entry は fresh start |
| A22 | TS async は自然に共存 |

## Round 5: API 利用者視点

### 決定事項
- FlowStore: restore() にオーバーロード追加（statePath 付き）。既存シグネチャは維持
- サブフロー定義は親 FlowDefinition に内包。resumeAndExecute のシグネチャ変更なし
- guardFailureCount: サブフローの FlowInstance に帰属。maxGuardRetries はサブフローの定義に従う
- 設定の支配ルール: フローレベル（TTL, flowId）= 親、遷移レベル（maxGuardRetries, error transitions）= 各定義
- circular reference: ビルド時にオブジェクト identity で循環検出
- statePath() を公開 API に + statePathString() = "PAYMENT/CONFIRM"
- サブフローは親を知らない（情報は context 経由で明示的に渡す）

### 追加アイデア
| # | アイデア |
|---|---------|
| A23 | FlowInstance.restore() オーバーロード |
| A24 | サブフロー定義は親 FlowDefinition に内包 |
| A25 | 設定支配ルール（フロー=親, 遷移=各定義）|
| A26 | circular reference 検出（ビルド時）|
| A27 | statePath() + statePathString() 公開 API |
| A28 | サブフローは親を知らない |

## Round 6: エッジケースと Plugin 先取り

### 決定事項
- キャンセルは専用 API 不要（サブフロー内 terminal + onExit で対応）
- 同一サブフロー定義の複数箇所利用 OK（onExit はマッピングが箇所ごと）
- withPlugin = 既存遷移に subFlow を前置挿入（状態追加不要、enum 変更なし）
- Plugin data-flow 検証は既存 checkRequiresProduces でカバー
- 共有テスト 9 ケース定義済み

### Plugin API (v1.3.0) 設計
```java
var extended = mainDef.withPlugin("CONFIRMED", "SHIPPED", giftWrapFlow);
// 内部: CONFIRMED→SHIPPED の auto 遷移の processor の前に giftWrapFlow を挿入
// enum 変更なし。新しい FlowDefinition を返す（元は不変）
```

### 共有テスト 9 ケース
1. Basic subFlow (auto-chain → sub → terminal → 返る)
2. SubFlow with external (sub 内 external 停止 → resume)
3. SubFlow error bubble (sub 内エラー → 親の error)
4. SubFlow error internal (sub 内 error terminal → onExit)
5. SubFlow re-entry (fresh start)
6. Nested subFlow (2 段)
7. Build validation - onExit missing
8. Build validation - data-flow
9. waitingFor() in subFlow

### 追加アイデア
| # | アイデア |
|---|---------|
| A29 | キャンセル専用 API 不要 |
| A30 | 同一 subFlow 複数箇所利用 OK |
| A31 | withPlugin = 前置挿入（状態追加なし）|
| A32 | Plugin data-flow は既存検証でカバー |
| A33 | 共有テスト 9 ケース |

## Round 7: 刈り込みと MVP

### v1.2.0-MVP（最小で動くサブフロー）
1. SubFlowTransition + Builder .subFlow().onExit()
2. onExit 網羅性検証（ビルド時）
3. FlowInstance.activeSubFlow
4. Engine auto-chain 再帰 + resume 委譲
5. テスト: Basic subFlow + SubFlow with external

### 段階リリース計画
```
v1.2.0: MVP（上記 5 項目）
v1.2.1: エラーバブリング + data-flow 結合検証 + circular ref + nesting depth
v1.2.2: statePath 永続化 + restore + TransitionRecord + waitingFor + statePathString
v1.2.3: Mermaid subgraph + DataFlowGraph フラット化
v1.3.0: withPlugin + Plugin data-flow 検証
```

### 競合比較
tramli の差別化: 3 行 subFlow / ビルド時 data-flow 検証 / 独立テスト可能 / 3 言語統一

### 見積もり
MVP ~650 行（3 言語合計）。テストシナリオ先行。

## Round 8: Red Team — 最終検証

### 確認事項
- 「アプリ層直列」は代替案だが data-flow 検証が分断 → Flow Composition 確定
- Plugin の制限: terminal 後の拡張不可（明文化）
- サブフロー別ファイル分割を推奨パターンとして記載
- withPlugin は future に格下げ（YAGNI）。需要が確認されるまで作らない

### 最終ロードマップ（修正）
```
v1.2.0: SubFlow MVP (6 項目)
v1.2.1: エラーバブリング + data-flow 結合検証 + circular ref + nesting depth
v1.2.2: statePath 永続化 + restore + TransitionRecord + waitingFor + statePathString
v1.2.3: Mermaid subgraph + DataFlowGraph フラット化
(withPlugin は future — 需要確認まで作らない)
```

### 全ラウンド統計
- 8 ラウンド / 41 アイデア / 9 Gap
- 設計原則 6 個確立
- MVP 6 項目 + 段階リリース 4 ステップ
