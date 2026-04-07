<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-003: FlowInstance.restore() factory メソッド

**Status:** draft
**Gap:** #12 (FlowInstance の再構築が外部パッケージから不可能)
**Session:** [R4](../sessions/2026-04-07-tramli-design-review-r4.md)

## 変更内容

外部パッケージの FlowStore 実装者が永続化データから FlowInstance を復元するための public static factory メソッドを追加。

## 変更箇所

### FlowInstance.java

```java
// 全フィールドコンストラクタ（パッケージプライベート）
FlowInstance(String id, String sessionId, FlowDefinition<S> definition,
             FlowContext context, S currentState, Instant createdAt,
             Instant expiresAt, int guardFailureCount, int version,
             String exitState) {
    this.id = id;
    this.sessionId = sessionId;
    this.definition = definition;
    this.context = context;
    this.currentState = currentState;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
    this.guardFailureCount = guardFailureCount;
    this.version = version;
    this.exitState = exitState;
}

/**
 * Restore a FlowInstance from persisted state.
 * Used by FlowStore implementations to reconstruct instances loaded from storage.
 *
 * @param createdAt  the original creation timestamp (not Instant.now())
 * @param exitState  null if the flow is still active
 */
public static <S extends Enum<S> & FlowState> FlowInstance<S> restore(
        String id, String sessionId, FlowDefinition<S> definition,
        FlowContext context, S currentState, Instant createdAt,
        Instant expiresAt, int guardFailureCount, int version,
        String exitState) {
    return new FlowInstance<>(id, sessionId, definition, context,
            currentState, createdAt, expiresAt, guardFailureCount,
            version, exitState);
}
```

`createdAt` フィールドを `final` から非 final に変更するか、全フィールドコンストラクタで直接設定。既存の public コンストラクタは変更なし。

## 影響範囲

- FlowInstance: コンストラクタ1つ + static factory 1つ追加
- 既存コード: 変更なし（既存コンストラクタは維持）
- InMemoryFlowStore: 変更不要（同パッケージなのでパッケージプライベートにもアクセス可能）
