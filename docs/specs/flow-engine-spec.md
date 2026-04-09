# FlowEngine Specification

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
| stateLogger | context.put() by processor (opt-in) | flowId, flowName, state, type/key, value |
| errorLogger | Error route taken or TERMINAL_ERROR | flowId, flowName, from, to, trigger, cause |
| guardLogger | After guard.validate() | flowId, flowName, state, guardName, result, reason |

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

transition = null
dataTypes = externalData.keySet()
for ext in externals:
  if ext.guard != null AND dataTypes.containsAll(ext.guard.requires):
    transition = ext
    break
if transition == null:
  transition = externals[0]  // fallback
```

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
6. flow.transitionTo(target)
7. store.recordTransition
8. Return 1

> **Note (DD-026 #17)**: Java does NOT fire enterAction/exitAction on branch.
> TS/Rust fire on all transitions including branch. Java is considered a bug.

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
