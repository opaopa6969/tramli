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
