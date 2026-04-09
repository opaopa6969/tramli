# Recommended FlowStore DB Schema

Reference schema for PostgreSQL. Adapt for your database.

## Tables

```sql
CREATE TABLE flow_instances (
    id              VARCHAR(64) PRIMARY KEY,
    flow_name       VARCHAR(128) NOT NULL,
    session_id      VARCHAR(128),
    current_state   VARCHAR(64) NOT NULL,
    context_json    JSONB NOT NULL DEFAULT '{}',
    guard_failure_count INT NOT NULL DEFAULT 0,
    version         INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    exit_state      VARCHAR(64),
    -- SubFlow support
    active_sub_flow_state VARCHAR(64),
    state_path      TEXT[]  -- e.g. {'PAYMENT', 'CONFIRM'}
);

CREATE TABLE transition_log (
    id          BIGSERIAL PRIMARY KEY,
    flow_id     VARCHAR(64) NOT NULL REFERENCES flow_instances(id),
    from_state  VARCHAR(64),
    to_state    VARCHAR(64) NOT NULL,
    trigger     VARCHAR(256) NOT NULL,
    sub_flow    VARCHAR(128),  -- null for main flow transitions
    context_snapshot JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flow_instances_session ON flow_instances(session_id);
CREATE INDEX idx_transition_log_flow ON transition_log(flow_id);
```

## FlowContext Serialization

FlowContext stores data keyed by type. For cross-language portability,
use **string aliases** instead of language-specific type identifiers.

### Alias Registration

```java
// Java: register alias before serialization
ctx.registerAlias(OrderRequest.class, "OrderRequest");
ctx.registerAlias(PaymentIntent.class, "PaymentIntent");

// Serialize: alias → JSON value
Map<String, String> json = ctx.toAliasMap();  // {"OrderRequest": "{...}", "PaymentIntent": "{...}"}
```

```rust
// Rust: register alias
ctx.register_alias::<OrderRequest>("OrderRequest");
```

```typescript
// TypeScript: FlowKey is already a string — no alias needed
const OrderRequest = flowKey<OrderRequest>('OrderRequest');
```

### JSON Format

```json
{
  "OrderRequest": {"itemId": "item-1", "quantity": 3},
  "PaymentIntent": {"transactionId": "txn-item-1"}
}
```

### Save / Load Pattern

```java
// Save
public void save(FlowInstance<?> flow) {
    String contextJson = objectMapper.writeValueAsString(flow.context().toAliasMap());
    ps.setString(4, contextJson);
    ps.setInt(5, flow.version());
    ps.executeUpdate();
}

// Load
public FlowInstance<S> loadForUpdate(String flowId, FlowDefinition<S> def) {
    Map<String, Object> contextMap = objectMapper.readValue(rs.getString("context_json"), MAP_TYPE);
    FlowContext ctx = FlowContext.fromAliasMap(flowId, contextMap, aliasRegistry);
    return FlowInstance.restore(flowId, sessionId, def, ctx, state, ...);
}
```

## Optimistic Locking

```sql
UPDATE flow_instances
SET current_state = ?, context_json = ?, version = version + 1, ...
WHERE id = ? AND version = ?;
-- If 0 rows updated → concurrent modification, throw
```

Use `FlowInstance.withVersion(newVersion)` after save to keep local state in sync.

## PostgreSQL Tips

### SET LOCAL must be a separate statement

Do NOT combine `SET LOCAL lock_timeout` with `SELECT` in one PreparedStatement:

```java
// ❌ WRONG: JDBC returns SET LOCAL's empty result, never reaches SELECT
ps = conn.prepareStatement("SET LOCAL lock_timeout = '5s'; SELECT * FROM flow_instances ...");

// ✅ CORRECT: separate statements
conn.createStatement().execute("SET LOCAL lock_timeout = '5s'");
ps = conn.prepareStatement("SELECT * FROM flow_instances WHERE id = ? FOR UPDATE");
```

### Flow definition mismatch

Never mix FlowDefinition versions within a single flow lifecycle. If `/callback` uses
FlowDefinition v2 but `/verify` still uses v1, `resumeAndExecute()` will fail with
`FLOW_NOT_FOUND` because the flow ID was created by v2.

**Rule: all endpoints in one authentication flow must use the same FlowDefinition instance.**

## FlowInstance.restore() Parameters

The `restore()` factory method takes 10 parameters. Reference:

| # | Parameter | Type | Notes |
|---|-----------|------|-------|
| 1 | id | String | Flow instance ID |
| 2 | sessionId | String | Session/correlation ID (nullable) |
| 3 | definition | FlowDefinition | Must match the flow's definition |
| 4 | context | FlowContext | Deserialized from DB |
| 5 | currentState | S (enum) | Current state enum value |
| 6 | createdAt | Instant/Date | Original creation time |
| 7 | expiresAt | Instant/Date | TTL expiry time |
| 8 | guardFailureCount | int | Current guard failure counter |
| 9 | version | int | Optimistic locking version |
| 10 | exitState | String? | null if active, state name if completed |

## loadForUpdate with Definition

TypeScript FlowStore implementations should accept `definition` as a second parameter:

```typescript
loadForUpdate<S extends string>(flowId: string, definition?: FlowDefinition<S>): FlowInstance<S> | undefined;
```

This allows the store to reconstruct `FlowInstance` using `FlowInstance.restore()`,
which requires the definition reference. InMemoryFlowStore ignores this parameter
since it holds FlowInstance objects directly.

## Auto-Chain Design Intent

**tramli's auto-chain executes synchronously to completion.** When `startFlow()` or
`resumeAndExecute()` is called, the engine fires all Auto/Branch transitions until
it hits an External transition or a terminal state. The call returns only after
the entire chain completes.

This is intentional:
- **Atomicity**: the chain is a single logical unit. Partial execution would require
  rollback coordination
- **Simplicity**: one request = one complete transition sequence
- **Predictability**: after `startFlow()` returns, the flow is either waiting at
  External or completed

**If you need UI progress updates during a long chain:**
1. Use External transitions to break the chain into steps, resuming from the client
2. Emit events from within processors (e.g., socket.io) for progress indication
3. Run `startFlow()` in a background task and poll `FlowInstance.currentState()`

## Error Information

When a processor throws during execution, the engine:
1. Restores context from backup (pre-processor state)
2. Sets `FlowInstance.lastError()` with the error message
3. Routes to the error transition (if configured via `onError`/`onAnyError`)

The `lastError` property is available for rollback processors to inspect what went wrong.

## PostgreSQL JDBC 実装の注意点

volta-auth-proxy の本番運用で発見された落とし穴。

### SET LOCAL + SELECT の複合文

```java
// ❌ 動かない — rs は SET LOCAL の結果（空）を返す
String sql = """
    SET LOCAL lock_timeout = '5s';
    SELECT ... FROM auth_flows WHERE id = ? FOR UPDATE
    """;
PreparedStatement ps = conn.prepareStatement(sql);
ResultSet rs = ps.executeQuery();
// → "クエリは結果を返却しませんでした" エラー

// ✅ 正しい — 別 Statement で実行
try (var stmt = conn.createStatement()) {
    stmt.execute("SET LOCAL lock_timeout = '5s'");
}
PreparedStatement ps = conn.prepareStatement("SELECT ... FOR UPDATE");
```

**影響例:** OIDC callback で flow が見つからない → 400 → セッション Cookie 未設定 → ログインループ。
エラーメッセージが「クエリは結果を返却しませんでした」で、flow データの問題に見えない。

### Set-Cookie ヘッダの上書き (Javalin)

FlowStore とは直接関係ないが、認証フローの実装で頻出:

```java
// ❌ Javalin の ctx.header() は上書き
ctx.header("Set-Cookie", "session=abc");
ctx.header("Set-Cookie", "mfa_flow=xyz");  // session cookie が消える

// ✅ addHeader で追加
ctx.res().addHeader("Set-Cookie", "session=abc");
ctx.res().addHeader("Set-Cookie", "mfa_flow=xyz");
```
