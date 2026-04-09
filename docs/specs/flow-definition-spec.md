# FlowDefinition Specification

**Source**: Java reference implementation (v3.1.0)

## Builder API

### Configuration Methods

| Method | Default | Description |
|--------|---------|-------------|
| ttl(Duration) | 5 min | Flow instance time-to-live |
| maxGuardRetries(int) | 3 | Max guard rejections before error |
| initiallyAvailable(types...) | empty | Types provided via startFlow(initialData) |
| allowPerpetual() | false | Skip path-to-terminal validation |

### Transition Methods

| Method | Creates |
|--------|---------|
| from(S).auto(to, processor) | AUTO transition |
| from(S).external(to, guard) | EXTERNAL transition |
| from(S).external(to, guard, processor) | EXTERNAL with post-guard processor |
| from(S).external(to, guard, timeout) | EXTERNAL with per-state timeout |
| from(S).external(to, guard, processor, timeout) | EXTERNAL with processor + timeout |
| from(S).branch(branchProcessor).to(S, label).to(S, label, proc).endBranch() | BRANCH transitions |
| from(S).subFlow(def).onExit(terminal, parentState).endSubFlow() | SUB_FLOW transition |

### Error Routing

| Method | Description |
|--------|-------------|
| onError(from, to) | State-based error fallback |
| onAnyError(errorState) | Set error target for all non-terminal states |
| onStepError(from, exceptionType, to) | Exception-typed routing (checked before onError) |

### Enter/Exit Actions

| Method | Description |
|--------|-------------|
| onStateEnter(state, action) | Callback after entering state (pure data/metrics) |
| onStateExit(state, action) | Callback before leaving state (pure data/metrics) |

## build() Process

1. Compute initialState (from FlowState.isInitial)
2. Compute terminalStates (from FlowState.isTerminal)
3. Run validation (10 checks)
4. Build DataFlowGraph
5. Build warnings
6. Return immutable FlowDefinition

## Validation Checks

| # | Check | Error Message |
|---|-------|---------------|
| 1 | Initial state exists | "No initial state found" |
| 2 | Reachability | "State X is not reachable from Y" |
| 3 | Path to terminal (skipped if perpetual) | "No path from X to any terminal state" |
| 4 | DAG (auto/branch only) | "Auto/Branch transitions contain a cycle" |
| 5 | Branch completeness | "Branch target 'label' -> X is not a valid state" |
| 6 | Requires/produces | "Guard/Processor/Branch 'X' requires Y but not available" |
| 7 | Auto-external conflict | "State X has both auto/branch and external transitions" |
| 8 | Terminal no outgoing | "Terminal state X has outgoing transition to Y" |
| 9 | SubFlow exit completeness | "SubFlow 'X' has terminal Y with no onExit mapping" |
| 10 | SubFlow nesting depth (max 3) | "SubFlow nesting depth exceeds maximum of 3" |
| 11 | SubFlow circular reference | "Circular sub-flow reference detected" |

### Requires/Produces Error Path Analysis

When a processor can fail, the error target state's requirements are checked against:
- Types available BEFORE the processor (guard produces included)
- Processor produces NOT included (processor failed)

## Warnings

| Warning | Condition |
|---------|-----------|
| Liveness risk | Perpetual flow + external transitions |
| Dead data | Types produced but never required downstream |
| Exception route ordering | Superclass before subclass in onStepError routes |

## Accessor Methods

| Method | Returns |
|--------|---------|
| transitionsFrom(state) | All transitions from state |
| externalFrom(state) | First external transition (or null) |
| externalsFrom(state) | All external transitions (for multi-external) |
| allStates() | All states in enum |
| enterAction(state) | Enter callback (or null) |
| exitAction(state) | Exit callback (or null) |
| warnings() | Build-time warning list |
| dataFlowGraph() | DataFlowGraph instance |

## withPlugin(from, to, pluginFlow)

Creates new FlowDefinition with sub-flow inserted before transition A→B.
- Copies: transitions, errorTransitions, enterActions, exitActions, exceptionRoutes, dataFlowGraph, warnings
- Name becomes "originalName+plugin:pluginName"
- Original FlowDefinition is NOT modified (immutable)
