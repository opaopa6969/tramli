---
status: accepted
---

# DD-019: Tramli.pipeline() — build 時検証付き直列パイプライン

**Date:** 2026-04-08
**Session:** [pipeline-vision](../sessions/2026-04-08-tramli-pipeline-vision.md) (7 rounds)

## Decision

tramli に `Tramli.pipeline()` DSL を追加。状態遷移なしの直列処理チェーンに、
requires/produces の build 時データフロー検証を適用する。

## 核心の洞察

tramli の本質は「状態遷移エンジン」ではなく「requires/produces 契約 + build 時検証」。
Pipeline はこの本質を状態遷移なしで提供する。

## API

```java
var pipeline = Tramli.pipeline("etl")
    .initiallyAvailable(RawInput.class)
    .step(parse).step(validate).step(save)
    .build();  // requires/produces チェーン検証

FlowContext result = pipeline.execute(Map.of(RawInput.class, data));
```

## 設計

- PipelineStep: StateProcessor の非ジェネリック版 (name, requires, produces, process)
- execute(): FlowContext を返す。エラーは PipelineException throw
- PipelineException extends FlowException (completedSteps, failedStep, context, cause)
- PipelineDataFlow: deadData(), toMermaid(), stepOrder(), availableAfter(stepName)
- Logger: LogEntry.Transition/State/Error を再利用。from/to = step 名
- strictMode: step 実行後に produces 検証
- asStep(): Pipeline を PipelineStep に変換（ネスト）
- StateLogger: step 前後の context key diff
- 永続化しない（1 リクエスト内で終わる処理）

## 使い分け

```
直列 2-4 step → 関数合成
直列 5+ step、データ蓄積 → Tramli.pipeline()
分岐 / 外部イベント → Tramli.define()
分散 / 長時間 → Airflow / Temporal
```

## ポジショニング

Pipeline = tramli の on-ramp。Pipeline → FlowDefinition へのアップグレードパスが明確。
