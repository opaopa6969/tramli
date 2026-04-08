# TECH-010: Multi-External Transitions

**DD:** DD-020
**Priority:** High (volta-gateway, user lifecycle flows)

## Summary

Allow multiple external transitions from a single state. Guard selection by requires() type matching.

## API Changes

### Builder DSL

```java
// Multiple externals from same state (currently build() error)
.from(ACTIVE)
    .external(ACTIVE, profileUpdateGuard)     // requires: ProfileUpdate
    .external(SUSPENDED, suspendGuard)        // requires: SuspendRequest
    .external(DEACTIVATED, deactivateGuard)   // requires: DeactivateRequest
```

### Engine: resumeAndExecute guard selection

```
1. Get all external transitions from current state
2. For each transition's guard:
   a. Check if guard.requires() types are ALL present in externalData
   b. If yes → evaluate this guard
3. If no guard matches → throw INVALID_TRANSITION
4. If multiple match → first in definition order wins (deterministic)
```

### Entry/Exit Actions

```java
.onStateEnter(ACTIVE, ctx -> ctx.put(ActivatedAt.class, Instant.now()))
.onStateExit(ACTIVE, ctx -> metrics.decrement("active_count"))
```

### Build Validation Changes

- Remove check #4 (at most 1 External per state) — replace with:
  - Multiple externals OK if each guard has **distinct requires types**
  - Warning if two guards require the same types (ambiguous routing)

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

1. Multi-external: 3 externals from ACTIVE, each with distinct requires
2. Guard selection: correct guard selected by externalData types
3. No match: externalData doesn't match any guard → INVALID_TRANSITION
4. Self-transition: ACTIVE → ACTIVE, guard_failure_count preserved
5. Entry/exit: callbacks fire on transition
6. Entry/exit on self-transition: both fire
7. Build warning: two guards with same requires types
