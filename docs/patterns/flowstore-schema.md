# Recommended FlowStore DB Schema

This guide is for developers implementing a database-backed `FlowStore`.
It provides a PostgreSQL reference schema and explains how to preserve flow data, restore instances, and detect conflicting updates. Adapt the schema and SQL to your database.

## Problem: a flow must survive the request that started it

A flow waiting for payment or an authentication callback may resume in another request or after a restart. Saving only its current state is not enough: the next processor also needs the data produced earlier, and the engine needs the original expiry and completion status. Two requests may also try to resume the same flow at once.

## What happens with the straightforward approach?

A row containing just an ID and a state can tell you where execution stopped, but cannot reconstruct the context needed to continue. Saving an unrestricted object dump ties the stored data to language-specific type names. Updating that row without checking its version can overwrite another request's progress.

A database schema addresses only part of the problem. The store must also serialize data, select the correct flow definition, reconstruct the instance, and coordinate writes.

## The pattern: persist an instance and its transition history

Keep the current flow instance in `flow_instances` and its transition records in `transition_log`. `FlowContext` is the flow's typed data container; store its values under stable string aliases so that the stored names do not depend on a language's internal type identifiers.

On load, turn those values back into the application's domain types and pass the saved metadata to `FlowInstance.restore()`. On update, compare the saved version with the database version to detect a concurrent change. The store owns transaction boundaries; tramli does not create them from this schema.

## Code examples

### Tables

The reference tables include state, context, lifetime, version, completion status, and fields for SubFlow metadata. A SubFlow is a child flow executed as part of a parent flow. These columns do not implement child-flow restoration by themselves; that remains part of the store implementation.

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

### FlowContext Serialization

Use the same aliases wherever stored context is written or read. An alias identifies a data type; it is not a JSON codec. The application's serializer must handle the value of that type.

#### Alias Registration

Java exports a map from aliases to objects. JSON serialization happens after that export. Rust also supports alias registration. In TypeScript, `FlowKey` already uses a string.

```java
// Java: register alias before serialization
ctx.registerAlias(OrderRequest.class, "OrderRequest");
ctx.registerAlias(PaymentIntent.class, "PaymentIntent");

// Export: alias → domain object
Map<String, Object> values = ctx.toAliasMap();  // alias → domain object
```

```rust
// Rust: register alias
ctx.register_alias::<OrderRequest>("OrderRequest");
```

```typescript
// TypeScript: FlowKey is already a string — no alias needed
const OrderRequest = flowKey<OrderRequest>('OrderRequest');
```

#### JSON Format

Store each domain value as JSON under its agreed alias:

```json
{
  "OrderRequest": {"itemId": "item-1", "quantity": 3},
  "PaymentIntent": {"transactionId": "txn-item-1"}
}
```

#### Save / Load Pattern

The following JDBC excerpt shows where context serialization and restoration fit. It assumes the connection, prepared statement, result set, and domain types already exist; SQL bindings, metadata reads, and exception handling are abbreviated. The load example assumes both shown values are present. A real store converts each saved value using its registered domain type.

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
    // Convert JSON values to domain objects before importing them.
    contextMap.put("OrderRequest", objectMapper.convertValue(contextMap.get("OrderRequest"), OrderRequest.class));
    contextMap.put("PaymentIntent", objectMapper.convertValue(contextMap.get("PaymentIntent"), PaymentIntent.class));
    FlowContext ctx = new FlowContext(flowId);
    ctx.registerAlias(OrderRequest.class, "OrderRequest");
    ctx.registerAlias(PaymentIntent.class, "PaymentIntent");
    ctx.fromAliasMap(contextMap);
    return FlowInstance.restore(flowId, sessionId, def, ctx, state, ...);
}
```

`fromAliasMap()` is an instance method: register aliases on the new context before calling it. It imports values without converting generic JSON maps into domain objects, which is why the conversion above is needed.

### Optimistic Locking

Only update the row if its version still matches the version you loaded:

```sql
UPDATE flow_instances
SET current_state = ?, context_json = ?, version = version + 1, ...
WHERE id = ? AND version = ?;
-- If 0 rows updated → concurrent modification, throw
```

If no row is updated, report the conflict instead of treating the save as successful. After a successful Java save, replace the locally held instance with the copy returned by `FlowInstance.withVersion(newVersion)` to keep its version in sync. Rust uses `set_version()`; see the [custom store guide](custom-flowstore.md).

### PostgreSQL Tips

#### SET LOCAL must be a separate statement

Execute `SET LOCAL lock_timeout` separately from the query that returns rows. Combining both in the illustrated `executeQuery()` path can expose the result of `SET LOCAL` instead of the expected row set. Use the same connection and transaction so the local setting applies to the query.

```java
// ❌ WRONG: JDBC returns SET LOCAL's empty result, never reaches SELECT
ps = conn.prepareStatement("SET LOCAL lock_timeout = '5s'; SELECT * FROM flow_instances ...");

// ✅ CORRECT: separate statements
conn.createStatement().execute("SET LOCAL lock_timeout = '5s'");
ps = conn.prepareStatement("SELECT * FROM flow_instances WHERE id = ? FOR UPDATE");
```

#### Flow definition mismatch

Every endpoint resuming one lifecycle must use the definition selected for that lifecycle. For example, `/callback` and `/verify` must agree on the definition used to restore the same stored flow. A definition describes allowed transitions and data requirements; it is not part of the serialized context.

Do not diagnose every `FLOW_NOT_FOUND` as a definition mismatch. The engine reports it when the store cannot return an active instance for the ID. If the store chooses rows by definition, check that selection as well as the ID and completion status. For deliberate upgrades, see [long-lived flows](long-lived-flows.md#restore-with-latest-definition).

### FlowInstance.restore() Parameters

The Java and TypeScript factories take these 10 parameters. The table uses Java-style type names, with `Date` for TypeScript timestamps. Java permits a null session ID; the TypeScript signature uses `string`.

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

These parameters restore the listed instance fields. They do not include an active child instance or the time the current state was entered. If your store must preserve those across reloads, account for them separately rather than assuming this factory restores them.

### loadForUpdate with Definition

The TypeScript engine passes a definition when loading an instance. A concrete store method can accept that optional argument to reconstruct the instance:

```typescript
loadForUpdate<S extends string>(flowId: string, definition?: FlowDefinition<S>): FlowInstance<S> | undefined;
```

`FlowInstance.restore()` needs the definition reference. `InMemoryFlowStore` ignores it because it already holds `FlowInstance` objects. This example describes the concrete loading method, not a replacement for the exported `FlowStore` interface. The current engine consumes the loaded instance synchronously; making this method return a Promise does not make that engine path asynchronous.

### Auto-Chain Design Intent

An auto-chain is the sequence of Auto and Branch transitions executed before the engine next waits at an External transition or reaches a terminal state. `startFlow()` and `resumeAndExecute()` complete that sequence before returning in Java, or before their returned Promise resolves in TypeScript.

This makes a chain one logical execution unit and leaves the caller at a defined stopping point. It does **not** automatically make the chain a database transaction or roll back external side effects. The store and application must provide those guarantees where needed.

For progress updates during a long chain:

1. Use External transitions to split it into steps, then resume from the client.
2. Emit progress events from processors, for example through socket.io.
3. Run `startFlow()` in a background task and poll the current state (`FlowInstance.currentState()` in Java), if the store exposes intermediate progress.

### Error Information

For Java processor exceptions, the engine restores the saved context, records the message in `FlowInstance.lastError()`, and routes to the configured `onError` or `onAnyError` transition. Error-handling code can inspect the message to understand the failure. Context restoration does not undo an HTTP request or a database write made by a processor.

<a id="postgresql-jdbc-実装の注意点"></a>

### JDBC and HTTP integration examples

These excerpts show two failures that can look like lost flow or session data in an authentication handler.

<a id="set-local--select-の複合文"></a>

#### Combined SET LOCAL and SELECT

The longer form of the JDBC example shows why the query can fail before the handler receives its flow row:

```java
// Incorrect: SET LOCAL does not produce the expected row set
String sql = """
    SET LOCAL lock_timeout = '5s';
    SELECT ... FROM auth_flows WHERE id = ? FOR UPDATE
    """;
PreparedStatement ps = conn.prepareStatement(sql);
ResultSet rs = ps.executeQuery();
// Error: the query did not return results

// Correct: execute with a separate Statement
try (var stmt = conn.createStatement()) {
    stmt.execute("SET LOCAL lock_timeout = '5s'");
}
PreparedStatement ps = conn.prepareStatement("SELECT ... FOR UPDATE");
```

If that failure stops an authentication callback before it sets a session cookie, the user may be sent back to login. Check the failed SQL operation before assuming the flow row is missing.

<a id="set-cookie-ヘッダの上書き-javalin"></a>

#### Replacing Set-Cookie headers in Javalin

This is an HTTP integration issue, separate from persistence. When an authentication response needs two cookies, replacing the header can discard the first one:

```java
// Incorrect: ctx.header() replaces the header
ctx.header("Set-Cookie", "session=abc");
ctx.header("Set-Cookie", "mfa_flow=xyz");  // replaces the session cookie

// Correct: append with addHeader
ctx.res().addHeader("Set-Cookie", "session=abc");
ctx.res().addHeader("Set-Cookie", "mfa_flow=xyz");
```

## When not to use this pattern

Use `InMemoryFlowStore` when flows only need to live within one process, such as in a unit test. A database schema adds serialization, transaction, and migration work that those flows may not need.

Treat this as a reference, not a ready-made persistent store. Applications with active SubFlows, state deadlines across restarts, or delivery guarantees beyond storing an instance need additional implementation and validation. Use an existing store that meets those needs when one is available.
