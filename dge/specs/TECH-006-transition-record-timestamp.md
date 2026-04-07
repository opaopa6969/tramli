<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-006: TransitionRecord にタイムスタンプ追加

**Status:** draft
**Gap:** #9 (可観測性の欠如)
**Session:** [R3](../sessions/2026-04-07-tramli-design-review-r3.md)

## 変更内容

TransitionRecord に `Instant timestamp` フィールドを追加。FlowStore.recordTransition() の呼び出し時に `Instant.now()` を記録。

## 変更箇所

### InMemoryFlowStore.java — TransitionRecord 修正

```java
// Before
public record TransitionRecord(String flowId, String from, String to, String trigger) {}

// After
public record TransitionRecord(String flowId, String from, String to, 
                                String trigger, Instant timestamp) {}
```

### FlowStore.java — recordTransition シグネチャは変更なし

FlowStore インターフェースの `recordTransition` は FlowContext を受け取っており、タイムスタンプは実装側で付与する。InMemoryFlowStore の実装内で `Instant.now()` を呼ぶ。

```java
// InMemoryFlowStore.recordTransition() 修正
@Override
public <S extends Enum<S> & FlowState> void recordTransition(
        String flowId, S from, S to, String trigger, FlowContext ctx) {
    transitionLog.add(new TransitionRecord(
            flowId, from.name(), to.name(), trigger, Instant.now()));
}
```

## 影響範囲

- InMemoryFlowStore: TransitionRecord にフィールド追加 + recordTransition 修正
- FlowStore インターフェース: 変更なし
- 既存テスト: TransitionRecord の参照箇所で timestamp フィールドの追加に伴うコンパイルエラー修正が必要
