<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-007: Javadoc による API 契約明文化

**Status:** draft
**Gap:** #1 (FlowStore 契約), #2 (アトミシティ), #5 (TTL), #8 (例外カタログ), #10 (Class キー制約), #18 (シリアライゼーション指針)
**Decision:** [DD-001](../decisions/DD-001-ttl-semantics.md)
**Session:** [R2](../sessions/2026-04-07-tramli-design-review-r2.md), [R4](../sessions/2026-04-07-tramli-design-review-r4.md)

## 変更内容

既存インターフェース・クラスの Javadoc を追加/拡充し、暗黙の契約を明文化する。コード変更なし。

## 対象ファイルと追加内容

### 1. FlowStore.java — インターフェース Javadoc

```java
/**
 * Persistence contract for flow instances.
 *
 * <h3>Threading</h3>
 * FlowEngine assumes single-threaded access per flow instance.
 * Implementations MUST ensure that concurrent calls to
 * {@link #loadForUpdate} for the same flowId are serialized
 * (e.g., SELECT FOR UPDATE, or application-level locking).
 *
 * <h3>Atomicity</h3>
 * {@link #create}/{@link #save} and {@link #recordTransition} calls between
 * them form a logical unit. Implementations SHOULD execute them within a
 * single transaction where possible. If partial writes occur, the flow state
 * ({@link #save}) is authoritative over the transition log.
 *
 * <h3>Optimistic Locking</h3>
 * {@link FlowInstance#version()} supports optimistic locking. Implementations
 * SHOULD increment version on {@link #save} and reject saves with stale versions.
 *
 * <h3>Serialization</h3>
 * {@link FlowInstance} contains a {@link FlowDefinition} reference which holds
 * lambdas and cannot be serialized. Persist only the instance metadata
 * (id, sessionId, currentState, createdAt, expiresAt, guardFailureCount,
 * version, exitState) and the context attributes. Use
 * {@link FlowInstance#restore} to reconstruct at load time, re-attaching
 * the current {@link FlowDefinition}.
 *
 * <p>For {@link FlowContext} attributes ({@code Map<Class<?>, Object>}),
 * serialize using {@code Class.getName()} as key and your chosen format
 * (e.g., Jackson JSON) for values. Jackson is an optional dependency.
 */
```

### 2. FlowEngine.java — クラス Javadoc（例外カタログ）

```java
/**
 * Generic engine that drives all flow state machines.
 *
 * <h3>Exceptions</h3>
 * <ul>
 *   <li>{@code FLOW_NOT_FOUND} — {@link #resumeAndExecute} with unknown or completed flowId</li>
 *   <li>{@code INVALID_TRANSITION} — {@link #resumeAndExecute} when no external transition exists from current state</li>
 *   <li>{@code MAX_CHAIN_DEPTH} — auto-chain exceeded 10 steps (possible definition issue)</li>
 *   <li>{@code EXPIRED} — flow TTL exceeded at {@link #resumeAndExecute} entry</li>
 * </ul>
 * Processor and branch exceptions are caught and routed to error transitions
 * (see {@link FlowDefinition.Builder#onError} / {@link FlowDefinition.Builder#onAnyError}).
 */
```

### 3. StateProcessor.java — 契約追加

```java
/**
 * Processes a state transition.
 *
 * <h3>Contract</h3>
 * <ul>
 *   <li>Processors SHOULD be fast and avoid external I/O (network calls,
 *       file system access). External interactions belong in
 *       {@link TransitionGuard} or external transitions.</li>
 *   <li>If a processor throws, the engine restores the context to its
 *       pre-execution state and routes to the error transition.</li>
 *   <li>{@link #requires()} types MUST be present in the context when
 *       the processor executes. This is validated at build time.</li>
 *   <li>{@link #produces()} types are added to the context after execution.
 *       Use dedicated record types as keys, not primitives or String.</li>
 * </ul>
 */
```

### 4. TransitionGuard.java — TTL との関係

```java
/**
 * Guards an External transition. Pure function — must not mutate FlowContext.
 * Accepted data is merged into context by the engine.
 *
 * <h3>TTL vs GuardOutput.Expired</h3>
 * {@link FlowInstance} TTL is checked at {@code resumeAndExecute} entry and
 * represents the flow-level expiration (see DD-001). {@link GuardOutput.Expired}
 * is a guard-level expiration for business logic (e.g., payment window closed).
 * They are independent mechanisms.
 *
 * <h3>maxRetries()</h3>
 * Currently unused by FlowEngine — the engine uses
 * {@link FlowDefinition#maxGuardRetries()} for all guards.
 * Per-guard retry limits are planned for a future version.
 */
```

### 5. FlowContext.java — Class キー制約

```java
/**
 * Accumulator for flow data. Each processor puts its produces,
 * subsequent processors get their requires. Keyed by Class —
 * each data type appears at most once.
 *
 * <h3>Key Design Pattern</h3>
 * Use dedicated record types as keys (e.g., {@code OrderRequest.class},
 * {@code PaymentResult.class}), not primitive wrappers or {@code String.class}.
 * Putting the same Class key twice silently overwrites the previous value.
 * The {@code requires/produces} build-time validation checks type presence
 * but does not detect overwrite conflicts.
 */
```

## 影響範囲

- コード変更なし（Javadoc のみ）
- 5ファイルの class-level または interface-level Javadoc を追加/拡充
