# DGE Session: tramli の感覚を全コードに — Pipeline Vision

- **Date**: 2026-04-08
- **Flow**: 💡 ブレスト
- **Characters**: ☕ ヤン, 👤 今泉, 🎭 ソクラテス, 🤝 後輩

## 核心の洞察

tramli の本質は「状態遷移エンジン」ではなく「requires/produces 契約 + build 時データフロー検証」。
状態遷移はこの上に乗るアプリケーションの1つ。

## ユーザーのモチベーション

tramli を使った部分と使ってない部分の落差が激しい。全コードで「読まなくていい量が95%減る」感覚を得たい。

## 結論

**案 A: Tramli.pipeline() DSL を tramli に追加**
- 内部: 全 Auto の FlowDefinition を自動生成
- 既存の build() 検証 / DataFlowGraph / Mermaid がそのまま使える
- Pipeline = External なし、分岐なしの tramli

## 将来ビジョン

全関数に requires/produces を付けてコンパイラが検証する = 言語レベルの Effect System。
理想として持ちつつ、現実は Tramli.pipeline() で 80% カバー。

## Round 2: Pipeline API 具体設計

### 確定事項
- PipelineStep: StateProcessor の非ジェネリック版（name, requires, produces, process）
- execute(): FlowContext を返す。エラーは FlowException throw
- 軽量検証: FlowDefinition を使わず直列の requires/produces を直接走査（20行）
- PipelineDataFlow: toMermaid + deadData（DataFlowGraph の軽量版）
- Logger API: FlowEngine と同じ LogEntry を再利用
- strictMode: produces 検証

### API イメージ
```java
var pipeline = Tramli.pipeline("etl")
    .initiallyAvailable(RawInput.class)
    .step(parse).step(validate).step(save)
    .build();  // ← requires/produces チェーン検証
FlowContext result = pipeline.execute(Map.of(RawInput.class, data));
```

## Round 3: エラーハンドリング / 条件スキップ / ネスト

### 確定事項
- エラー: 即停止 + PipelineException (completedSteps, failedStep, context, cause)
- 条件スキップ: process() 内で if return。produces 空にする。find() で optional 取得
- 補償: Pipeline の外。context で情報提供のみ（DD-002 踏襲）
- ネスト: Pipeline.asStep() で Pipeline を PipelineStep に変換
- async: TS のみ（DD-013 踏襲）
- Railway パターン: 不採用（FlowDefinition の仕事）

## Round 4: 刈り込みと MVP

### 確定事項
- tramli のアイデンティティ「Constrained flow engine」は維持。Pipeline は flow のバリエーション
- Pipeline は tramli 本体に 1 ファイル追加（別ライブラリにしない）
- 永続化しない。「1 リクエスト内で終わる直列処理」に限定
- FlowContext/FlowError/LogEntry を共有。FlowDefinition/FlowEngine/FlowStore は共有しない

### MVP
PipelineStep + Builder(.step().build()) + execute→FlowContext + build検証 + PipelineDataFlow(toMermaid+deadData) + PipelineException(completedSteps/failedStep/context/cause) + TransitionLogger + ErrorLogger

### 入れない（将来）
asStep(), strictMode, StateLogger

### テスト 6 ケース
1. Happy path  2. requires 不足  3. step 失敗  4. deadData  5. Mermaid  6. 空パイプライン

### 見積もり
~180 行 × 3 言語 = ~540 行

## Round 5: 全機能確定（MVP 後回し分も含む）

### 追加確定事項
- asStep(): Pipeline.execute() のラッパー。requires=initiallyAvailable, produces=全stepのproducesの和
- strictMode: step 実行後に produces 検証。PipelineException で報告
- StateLogger: step 前後の context key diff。FlowContext 変更なし

### 最終実装スコープ（一気に全部やる）
PipelineStep + Builder + execute + build検証 + PipelineDataFlow + PipelineException + 3 Logger + strictMode + asStep

### テスト（追加）
7. strictMode produces 違反
8. asStep ネスト
9. StateLogger が put を検出

## Round 6: Red Team

### 発見
- Pipeline は 5+ step で価値。2-4 step は関数合成で十分
- Pipeline の真の価値 = accumulator（FlowContext）+ build 時検証
- volta-gateway リクエスト処理パイプラインが理想的なユースケース
- Pipeline = tramli の on-ramp（入門パス → FlowDefinition へアップグレード）

### 使い分けガイド
```
直列 2-4 step → 関数合成
直列 5+ step、データ蓄積 → Tramli.pipeline()
分岐 / 外部イベント → Tramli.define()
分散 / 長時間 → Airflow / Temporal
```

## Round 7: 命名 + 最終矛盾チェック

### 確定事項
- 名前: `Tramli.pipeline()`, `PipelineStep`, `PipelineException`, `PipelineDataFlow`
- PipelineException extends FlowException (completedSteps, failedStep, context)
- PipelineDataFlow: deadData(), toMermaid(), stepOrder(), availableAfter(stepName)
- TransitionLogger の from/to = step 名（最初は "initial"）
- 全ラウンドの決定に矛盾なし

## 全体統計
- 7 ラウンド / 34 アイデア
- 設計原則 5 個確立
- 全機能: PipelineStep + Builder + execute + 検証 + PipelineDataFlow + PipelineException + 3 Logger + strictMode + asStep
- テスト 9 ケース
