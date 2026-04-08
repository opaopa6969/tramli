# TECH-011: Long-Lived Flow Patterns

**DD:** DD-020 (multi-external enables long-lived), DD-021 (flat is correct)
**Priority:** Medium (user lifecycle, subscription management)
**Session:** [user-lifecycle](../sessions/dge-session-user-lifecycle.md)

## Summary

Design patterns for flows that live for months/years (user accounts, subscriptions)
rather than seconds/minutes (authentication, payment).

## Patterns

### 1. Perpetual + Multi-External

```java
var userLifecycle = Tramli.define("user-lifecycle", UserState.class)
    .ttl(Duration.ofDays(365 * 100))  // effectively perpetual
    .allow_perpetual()
    .initiallyAvailable(SignupRequest.class)
    .from(PENDING).auto(ACTIVE, activateProcessor)
    .from(ACTIVE)
        .external(ACTIVE, profileUpdateGuard)       // self-transition
        .external(SUSPENDED, suspendGuard)
        .external(DEACTIVATED, deactivateGuard)
    .from(SUSPENDED)
        .external(ACTIVE, reactivateGuard)
        .external(DEACTIVATED, deactivateGuard)
    .build();
```

### 2. Definition Upgrade (DB restore with latest definition)

```java
// v1 definition
var v1 = Tramli.define("user", UserState.class).from(ACTIVE).external(SUSPENDED, ...)...build();

// v2 definition (adds DEACTIVATED)
var v2 = Tramli.define("user", UserState.class).from(ACTIVE).external(SUSPENDED, ...)
    .from(ACTIVE).external(DEACTIVATED, ...)...build();

// Check compatibility
var issues = DataFlowGraph.versionCompatibility(v1.dataFlowGraph(), v2.dataFlowGraph());
// → [] (v2 is superset of v1, all v1 instances can resume on v2)
```

### 3. Cross-Flow Contract (Phase 2, if needed)

For orthogonal concerns (billing separate from authentication):
- Two separate FlowDefinitions
- Linked by shared context types
- `crossFlowMap()` validates data dependencies

## NOT-DOING

- Orthogonal regions (DD-021: breaks data-flow verification)
- Built-in event sourcing (use FlowStore + TransitionRecord)
- Built-in audit trail (TransitionRecord is the audit trail)
