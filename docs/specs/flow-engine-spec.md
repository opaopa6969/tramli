# FlowEngine Specification

This specification defines the processing order when `FlowEngine` starts or resumes a flow, external event selection, restoration after failures, and error routes.
It is intended for Java, TypeScript, and Rust implementers and for users who want to understand runtime behavior.
For use cases, see [Why tramli exists](../../README.md#why-tramli-exists) in the README; for an overview, see [FlowEngine](../../README.md#flowengine).

**How to read**: Read [FlowContext](flow-context-spec.md) and [FlowDefinition](flow-definition-spec.md) first, then follow execution in this document through Configuration → startFlow → resumeAndExecute → executeAutoChain → handleError.
Refer to Loggers, FlowInstance Behavior, and Exception Codes for logging, state updates, and errors mentioned in each step.

**Terminology**: A flow definition describes states and transitions; a flow instance (FlowInstance) is an individual execution that follows that definition; FlowStore is an interface for storing and retrieving instances.
A Processor performs work associated with a transition; a Guard validates an external event; `requires` / `produces` declare needed / provided data; a snapshot is data saved for restoration.
An auto-chain executes automatic transitions and branches in succession; SubFlow is a child flow embedded in a parent flow; TTL (time-to-live) is the lifetime of a flow; a UUID is a unique identifier used to identify an instance.
An explicit trigger is an event-identifying type/key specified by `externalOn`; legacy refers to selection based on a Guard's `requires` without that specification.
DD-026 #17 identifies the design decision that Branch transitions fire state entry/exit callbacks in all three languages.

**Source**: Java reference implementation (v3.1.0)

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| strictMode | false | Verify produces() after processor execution |
| maxChainDepth | 10 | Maximum auto-chain steps before MAX_CHAIN_DEPTH error |

## Loggers

| Logger | Fires When | Entry Fields |
|--------|-----------|--------------|
| transitionLogger | Every state transition | flowId, flowName, from, to, trigger |
| stateLogger | After a successful Auto / label-specific Branch / External processor, once per added or replaced key (opt-in; no notification on processor failure or produces violation) | flowId, flowName, state (transition source), type/key, final value |
| errorLogger | Error route taken or TERMINAL_ERROR | flowId, flowName, from, to, trigger, cause |
| guardLogger | After guard.validate() | flowId, flowName, state, guardName, result, reason |

State logging compares the context immediately before and after each processor. Java / TypeScript
notify new keys and values replaced by reference identity (`!=` / `!==`); putting the same
reference or mutating an existing object in place does not notify. Rust records the types
written by `put` during the processor: each `put` replaces an owned value, even if equal.
Repeated writes to one key produce one entry with its final value. Initial data, external
data, guard output data, and state enter/exit actions are excluded. Failed processors
restore context without emitting state entries; Auto produces validation also precedes logging.
No logging snapshots or write tracking are allocated when the state logger is unset.
Rust uses the full type name as `key`; `value` renders strings and scalar primitives,
and is `<opaque: TYPE_NAME>` for other `CloneAny` values, which have no formatting bound.
Entry ordering is unspecified.

## startFlow

1. Generate flowId (UUID)
2. Create FlowContext with flowId
3. Merge initialData into context via putRaw (no state logging)
4. Get initialState from definition
5. Calculate expiresAt = now + definition.ttl
6. Create FlowInstance (guardFailureCount=0, version=0, exitState=null)
7. store.create(flow)
8. executeAutoChain(flow)
9. store.save(flow)
10. Return flow

## resumeAndExecute

### Entry

1. Load flow via store.loadForUpdate(flowId, definition)
2. If not found: throw FLOW_NOT_FOUND (or FLOW_ALREADY_COMPLETED if completed)
3. Merge externalData into context via putRaw

### TTL Check

```
if now > flow.expiresAt:
  flow.complete("EXPIRED")
  flow.setLastError("TTL expired")
  store.save(flow)
  return  // EARLY EXIT
```

### Sub-Flow Delegation

```
if flow.activeSubFlow != null:
  delegate to resumeSubFlow
  return
```

### Multi-External Selection

```
externals = definition.externalsFrom(currentState)
if externals.isEmpty: throw INVALID_TRANSITION

dataTypes = externalData.keySet()
if externals use explicit triggers:
  matches = externals where dataTypes contains guard.externalTrigger
else if externals.size == 1:
  matches = [externals[0]]  // legacy compatibility
else:
  matches = externals where dataTypes containsAll guard.requires
  matches = entries with the largest requires size

if matches.empty: throw EXTERNAL_EVENT_NOT_MATCHED
if matches.size > 1: throw EXTERNAL_EVENT_AMBIGUOUS
transition = matches[0]
```

At build time, multiple Externals from one state must be all explicit or all
legacy. Explicit triggers must be distinct. Legacy `requires` sets must remain
distinct. Declaration order is never a routing tie-breaker.

### Per-State Timeout

```
if transition.timeout != null AND flow.stateEnteredAt != null:
  deadline = flow.stateEnteredAt + transition.timeout
  if now > deadline:
    flow.complete("EXPIRED")
    store.save(flow)
    return  // EARLY EXIT
```

### Guard Validation

**Guard present:**

Log guard result (accepted/rejected/expired).

**Accepted:**
1. backup = context.snapshot()
2. Merge accepted.data into context
3. Execute transition.processor (if present)
4. fireExit(flow, from)
5. flow.transitionTo(to)
6. fireEnter(flow, to)
7. store.recordTransition
8. On processor exception: context.restoreFrom(backup), handleError

**Rejected:**
1. flow.incrementGuardFailure(guardName)
2. If guardFailureCount >= maxGuardRetries: handleError(flow, currentState)
3. store.save(flow), return

**Expired:**
1. flow.complete("EXPIRED")
2. store.save(flow), return

**No guard:**
1. fireExit(flow, from)
2. flow.transitionTo(to)
3. fireEnter(flow, to)
4. store.recordTransition

### After Transition

```
executeAutoChain(flow)
store.save(flow)
return flow
```

## executeAutoChain

```
depth = 0
while depth < maxChainDepth:
  current = flow.currentState
  if current.isTerminal: flow.complete(current.name); break

  // Dispatch order: SubFlow > Auto/Branch > External(stop)
  result = dispatchStep(flow, current)
  if result == ERROR: return     // error handled, exit
  if result == STOP: break       // external or no transition
  depth += result

if depth >= maxChainDepth: throw MAX_CHAIN_DEPTH
```

### dispatchAuto

1. backup = context.snapshot()
2. Execute processor (if present)
3. verifyProduces (if strictMode)
4. On error: context.restoreFrom(backup), handleError, return ERROR
5. fireExit(flow, from)
6. flow.transitionTo(to)
7. fireEnter(flow, to)
8. store.recordTransition
9. Return 1

### dispatchBranch

1. backup = context.snapshot()
2. label = branch.decide(context)
3. target = branchTargets[label] (throw UNKNOWN_BRANCH if not found)
4. Execute specific branch processor (if present)
5. On error: context.restoreFrom(backup), handleError, return ERROR
6. fireExit(flow, from)
7. flow.transitionTo(target)
8. fireEnter(flow, target)
9. store.recordTransition
10. Return 1

> **Note (DD-026 #17)**: enterAction/exitAction fire on branch transitions in all three
> implementations. Java previously skipped them; that was fixed in commit 3299424d.

## handleError

### Priority 1: Exception-Typed Routes (onStepError)

```
if cause != null:
  routes = definition.exceptionRoutes[fromState]
  for route in routes:
    if route.exceptionType.isInstance(cause):
      flow.transitionTo(route.target)
      if route.target.isTerminal: flow.complete(route.target.name)
      return  // MATCHED
```

### Priority 2: State-Based Error (onError)

```
errorTarget = definition.errorTransitions[fromState]
if errorTarget != null:
  flow.transitionTo(errorTarget)
  if errorTarget.isTerminal: flow.complete(errorTarget.name)
else:
  flow.complete("TERMINAL_ERROR")
```

## FlowInstance Behavior

### transitionTo(newState)

```
stateChanged = (currentState != newState)
currentState = newState
stateEnteredAt = now
if stateChanged:
  guardFailureCount = 0
  guardFailureCounts.clear()
```

### incrementGuardFailure(guardName)

```
guardFailureCount++
guardFailureCounts[guardName] += 1
```

### complete(exitState)

Sets exitState. Flow.isCompleted returns true. Cannot be resumed.

## Exception Codes

| Code | When |
|------|------|
| FLOW_NOT_FOUND | resumeAndExecute on missing flowId |
| FLOW_ALREADY_COMPLETED | resumeAndExecute on completed flow |
| INVALID_TRANSITION | No external transition available |
| MAX_CHAIN_DEPTH | Auto-chain exceeded maxChainDepth |
| EXPIRED | Flow TTL exceeded |
| PRODUCES_VIOLATION | strictMode: processor missing declared output |
| UNKNOWN_BRANCH | BranchProcessor returned unmapped label |
