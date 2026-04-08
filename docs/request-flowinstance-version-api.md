# Feature Request: FlowInstance version management for external FlowStore

## 背景

volta-auth-proxy を tramli v1.2.0 に移行した際、`SqlFlowStore`（PostgreSQL 実装）で問題が発生した。

`FlowInstance` の `setVersion()` / `incrementGuardFailure()` / `transitionTo()` は package-private であるため、`org.unlaxer.tramli` パッケージ外の FlowStore 実装からアクセスできない。

`FlowInstance.restore()` で loadForUpdate 時の再構築は解決できた。しかし **save 後の version インクリメント**に public API がない。

## 問題

```java
// SqlFlowStore.save() — optimistic locking
public void save(FlowInstance<?> flow) {
    // UPDATE ... SET version = version + 1 WHERE id = ? AND version = ?
    int updated = ps.executeUpdate();
    if (updated == 0) throw concurrentModification();

    // ここで flow のローカル version を +1 したいが、setVersion() にアクセスできない
    // flow.setVersion(flow.version() + 1);  // ← package-private
}
```

現状の回避策: save 後の version 更新を省略。次の `loadForUpdate()` で DB から正しい version を取得する。

**リスク**: 同一リクエスト内で FlowEngine が save → 再度 save するパス（auto-chain 中の複数 save 等）がある場合、ローカルの version が DB と乖離し、2回目の save で optimistic locking エラーになる可能性がある。

## 提案

以下のいずれか:

### A. `withVersion(int)` コピーファクトリ（推奨）

```java
// FlowInstance に追加
public FlowInstance<S> withVersion(int newVersion) {
    return new FlowInstance<>(id, sessionId, definition, context,
            currentState, createdAt, expiresAt, guardFailureCount, newVersion, exitState);
}
```

FlowStore 側:
```java
flow = flow.withVersion(flow.version() + 1);
```

immutable 寄りの API で、restore() と一貫性がある。

### B. `setVersion()` を public にする

最小の変更。ただし FlowInstance の mutable API が外部に露出する。

### C. FlowStore にデフォルトメソッドを追加

```java
// FlowStore に追加
default void postSave(FlowInstance<?> flow) {}
```

FlowEngine が save 後に呼ぶ。実装側で version 管理等を行う。

## 環境

- tramli: v1.2.0
- Java: 21
- 報告元: volta-auth-proxy (PostgreSQL FlowStore + optimistic locking)
