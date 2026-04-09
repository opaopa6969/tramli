# Session Handoff — 2026-04-09

## 完了したこと

### v3.0.0 リリース
- **ts-plugins/**: Java 14 プラグインを TypeScript にフル移植（21 テスト）
- **rust-plugins/**: Java 14 プラグインを Rust にフル移植（14 テスト）
- **README (en/ja)**: プラグインセクション追加 + 3 言語 `<details>` 折りたたみ
- **チュートリアル (en/ja)**: 会話劇形式（新人＋作者）全 11 幕
- **OIDC 例 (en/ja)**: プラグイン拡張セクション 8.1〜8.7 追加、3 言語折りたたみ
- **long-lived-flows (en/ja)**: 日本語版新規作成 + 3 言語折りたたみ
- **6 パッケージ publish**: npm (2), crates.io (2), Maven Central (2) ※Maven 3.1.0 は失敗

### v3.1.0 リリース（minor）
- **DD-025**: `StateConfig.initial` を optional 化（default false）
- 全テスト・サンプル・ドキュメントから `initial: false` を除去
- npm (2), crates.io (2) publish 済み。Maven は 3.1.0 欠番（Central autoPublish 失敗、次回まとめて出す）

### ドキュメント改善
- README 初心者向けアナロジー追加（ボードゲーム、ドミノ、レシピ、門番）
- 8 項目検証に「なぜ必要か」のエピソード追加
- DGE セッションが架空の AI 対話であることを明記
- ドキュメントリンクのセクション改行修正

### DD-026 P0 完了: ロガー配線
- TS: transitionLogger 全 8 箇所、errorLogger、guardLogger 新規追加、flowName 追加
- Rust: transition_logger、error_logger、guard_logger 全配線、flow_name 追加

### DD 記録
- DD-022: Plugin 3 言語対称性
- DD-023: v3.0.0 リリース戦略
- DD-024: ドキュメント 3 言語 details fold
- DD-025: StateConfig.initial optional
- DD-026: 3 言語実装差異の解消（P0〜P2）
- DD-027: tramli-viz リアルタイム監視デモ

---

## 残タスク: DD-026 P1 + P2

### P1 — API 対称性（次セッションの主作業）

| # | タスク | 対象 | 状態 |
|---|--------|------|------|
| 74 | externalsFrom() + Guard requires マッチ選択 | TS | pending |
| 75 | externals_from() + Guard requires マッチ選択 | Rust | pending |
| 76 | onStateEnter / onStateExit | TS + Rust | pending |
| 77 | onStepError + context rollback + per-state timeout | Rust | pending |

**実装方針:**
- Java を正（リファレンス実装）として合わせる
- Java の FlowEngine.java / FlowDefinition.java を読みながら TS/Rust に移植

**キーファイル:**
- Java リファレンス: `java/src/main/java/org/unlaxer/tramli/FlowEngine.java`, `FlowDefinition.java`
- TS 対象: `ts/src/flow-engine.ts`, `ts/src/flow-definition.ts`
- Rust 対象: `rust/src/engine.rs`, `rust/src/definition.rs`

**externalsFrom の仕様（Java）:**
- `FlowDefinition.externalsFrom(S state)` → `List<Transition<S>>` で全 External 遷移を返す
- `FlowEngine.resumeAndExecute` で external data の型と guard.requires() をマッチして guard を選択
- マッチしない場合は最初の external にフォールバック

**onStateEnter/Exit の仕様（Java）:**
- `Builder.onStateEnter(S state, Consumer<FlowContext>)` で登録
- `FlowEngine` の `transitionTo` 前後で `fireExit(old)` → `fireEnter(new)` を呼ぶ
- FlowDefinition に `enterAction(S)` / `exitAction(S)` アクセサ

**onStepError の仕様（Java）:**
- `Builder.onStepError(S from, Class<? extends Exception>, S to)` で登録
- `FlowDefinition.exceptionRoutes` に格納
- `handleError` で cause の instanceof チェック → マッチした route の target に遷移
- マッチしなければ通常の onError フォールバック

**context rollback（Java/TS 共通パターン）:**
- processor 呼び出し前に `ctx.snapshot()` でバックアップ
- processor が throw したら `ctx.restoreFrom(backup)` で復元
- Rust では FlowContext に snapshot/restore_from を追加する必要がある

**per-state timeout（Java/TS 共通パターン）:**
- `Transition` に `timeout: Duration` フィールド
- `resumeAndExecute` の冒頭で `stateEnteredAt + timeout` と現在時刻を比較
- 超過時は `flow.complete("EXPIRED")`

### P2 — あると良い

| # | タスク | 対象 |
|---|--------|------|
| 78a | FlowContext registerAlias / toAliasMap / fromAliasMap | TS |
| 78b | build() warnings (dead data, liveness, exception route ordering) | Rust |
| 78c | allow_perpetual | Java + TS |
| 78d | per-guard failure count (Map) | TS + Rust |

---

## 残タスク: DD-027 tramli-viz

DD-026 P1 完了後に着手:

```
viz/
├── server/          → TS WebSocket サーバー + VizSink プラグイン
├── web/             → React + React Flow (xyflow)
└── demo/            → OIDC シミュレーター
```

デモシナリオ: Auto chain, External, Branch, Guard reject, Error, SubFlow, Idempotency, Compensation, Historical replay

---

## Maven Central の状況

v3.0.0: publish 済み（正常）
v3.1.0: バンドルアップロード成功、autoPublish で失敗
- 原因不明（GPG agent 警告あり、Central portal で確認が必要）
- 次の feature リリース（3.2.0）でまとめて出す予定
- npm / crates.io は 3.1.0 まで publish 済み

---

## テスト状況

| スイート | テスト数 | 状態 |
|---------|---------|------|
| Java core | all | passing |
| Java plugins | 11 | passing |
| TS core | 48 | passing |
| TS plugins | 21 | passing |
| Rust core | 17 | passing |
| Rust plugins | 14 | passing |

全 100+ テスト green。
