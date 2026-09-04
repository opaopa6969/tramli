# TECH-010: Multi-External Transitions

> Superseded by [TECH-012](TECH-012-external-trigger-routing.md) for routing.
> Entry/exit actions and self-transition decisions remain valid.

**DD:** DD-020
**Priority:** High (volta-gateway, user lifecycle flows)

## Summary

Allow multiple external transitions from a single state. New definitions use
typed trigger routing from TECH-012; legacy `requires()` routing remains for
compatibility.

## API Changes

### Builder DSL

```java
// Multiple externals from same state (currently build() error)
.from(ACTIVE)
    .externalOn(ProfileUpdate.class, ACTIVE, profileUpdateGuard)
    .externalOn(SuspendRequest.class, SUSPENDED, suspendGuard)
    .externalOn(DeactivateRequest.class, DEACTIVATED, deactivateGuard)
```

### Engine: resumeAndExecute guard selection

```
1. Get all external transitions from current state
2. Select the unique explicit trigger present in the current externalData
3. If none matches → `EXTERNAL_EVENT_NOT_MATCHED`
4. If multiple match → `EXTERNAL_EVENT_AMBIGUOUS`
```

### Entry/Exit Actions

```java
.onStateEnter(ACTIVE, ctx -> ctx.put(ActivatedAt.class, Instant.now()))
.onStateExit(ACTIVE, ctx -> metrics.decrement("active_count"))
```

### Build Validation Changes

- Remove check #4 (at most 1 External per state) — replace with:
  - Multiple explicit externals require distinct trigger types
  - Explicit and legacy routing cannot be mixed at one state

### FlowInstance Changes

- `guard_failure_count` keyed by **guard name** (Map<String, Integer>)
- Count cleared only on **actual state change** (not self-transition)

## Implementation

### Java

```java
// FlowDefinition: remove checkExternalUniqueness, add checkExternalRequiresDistinct
// FlowEngine.resumeAndExecute: iterate externals, match by requires
// FlowInstance: guardFailureCounts: Map<String, Integer>
// Builder: onStateEnter/onStateExit(state, Consumer<FlowContext>)
```

### TypeScript

```typescript
// Same pattern, Consumer<FlowContext> → (ctx: FlowContext) => void
```

### Rust

```rust
// Same pattern, Box<dyn Fn(&mut FlowContext) + Send + Sync>
```

## Test Cases

1. Multi-external: 3 externals from ACTIVE, each with a distinct trigger
2. Guard selection: correct guard selected by externalData types
3. No match: externalData doesn't match any trigger → EXTERNAL_EVENT_NOT_MATCHED
4. Self-transition: ACTIVE → ACTIVE, guard_failure_count preserved
5. Entry/exit: callbacks fire on transition
6. Entry/exit on self-transition: both fire
7. Build error: two transitions with the same trigger type
