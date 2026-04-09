# Shared Test Scenarios — 3 言語共通

各言語で以下のシナリオを同じ入力・同じ期待出力でテストする。
テスト名は全言語で統一する（snake_case）。

---

## S01: Basic Auto Chain

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(P1), B→C auto(P2)
**P1**: requires [D], produces [E], puts E("from-{D.value}")
**P2**: requires [E], produces []

**Test: s01_auto_chain_completes**
- startFlow with initialData: {D: "hello"}
- Expect: currentState = C, isCompleted = true, exitState = "C"
- Expect: context.get(E) = "from-hello"

---

## S02: External Guard Accepted

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard)
**Guard**: requires [PaymentData], produces [Receipt], returns Accepted({Receipt: "ok"})

**Test: s02_guard_accepted**
- startFlow → state = B, not completed
- resumeAndExecute with {PaymentData: "card"}
- Expect: currentState = C, isCompleted = true
- Expect: context.get(Receipt) = "ok"

---

## S03: External Guard Rejected Then Accepted

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard), maxGuardRetries=3
**Guard**: first call → Rejected("insufficient"), second call → Accepted

**Test: s03_guard_rejected_then_accepted**
- startFlow → state = B
- resumeAndExecute → rejected, guardFailureCount = 1, state = B
- resumeAndExecute → accepted, state = C, guardFailureCount reset to 0

---

## S04: Guard Max Retries Routes to Error

**States**: A(initial) → B → ERR(terminal)
**Transitions**: A→B auto(noop), B→C external(alwaysRejectGuard), onError(B, ERR)
**maxGuardRetries = 2**

**Test: s04_guard_max_retries_error**
- startFlow → state = B
- resumeAndExecute → rejected, guardFailureCount = 1
- resumeAndExecute → rejected, guardFailureCount = 2 → handleError → state = ERR
- Expect: isCompleted = true, exitState = "ERR"

---

## S05: Guard Expired

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(expiredGuard)

**Test: s05_guard_expired**
- startFlow → state = B
- resumeAndExecute → guard returns Expired
- Expect: isCompleted = true, exitState = "EXPIRED"

---

## S06: Processor Error with Context Rollback

**States**: A(initial) → B → ERR(terminal)
**Transitions**: A→B auto(noop), B→C external(guard, failingProcessor), onError(B, ERR)
**guard**: returns Accepted({TempData: "temp"})
**failingProcessor**: throws error

**Test: s06_processor_error_rollback**
- startFlow → state = B
- resumeAndExecute
- Expect: state = ERR (error route)
- Expect: context does NOT have TempData (rolled back)

---

## S07: Branch Transition

**States**: A(initial) → B → GOOD(terminal), BAD(terminal)
**Transitions**: A→B auto(noop), B→branch(decider) to(GOOD, "yes") to(BAD, "no")
**decider**: reads Flag from context, returns "yes" if Flag == true, else "no"

**Test: s07_branch_yes**
- startFlow with {Flag: true}
- A→B auto, B→GOOD branch
- Expect: currentState = GOOD

**Test: s07_branch_no**
- startFlow with {Flag: false}
- Expect: currentState = BAD

---

## S08: onStateEnter / onStateExit

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C auto(noop)
**enterActions**: B → put(EnteredB, true), C → put(EnteredC, true)
**exitActions**: A → put(ExitedA, true), B → put(ExitedB, true)

**Test: s08_enter_exit_actions**
- startFlow
- Expect: context has ExitedA = true (A exited)
- Expect: context has EnteredB = true (B entered)
- Expect: context has ExitedB = true (B exited)
- Expect: context has EnteredC = true (C entered)
- Expect: currentState = C

---

## S09: onStepError Exception Route

**States**: A(initial) → B → SPECIAL_ERR(terminal), GENERIC_ERR(terminal)
**Transitions**: A→B auto(noop), B→C auto(failingProcessor)
**onStepError(B, SpecificError, SPECIAL_ERR)**
**onError(B, GENERIC_ERR)**
**failingProcessor**: throws SpecificError

**Test: s09_exception_route_specific**
- startFlow
- A→B auto ok, B→C processor throws SpecificError
- Expect: state = SPECIAL_ERR (not GENERIC_ERR)

**Test: s09_exception_route_fallback**
- Same setup but processor throws GenericError (not SpecificError)
- Expect: state = GENERIC_ERR

---

## S10: Multi-External Guard Selection

**States**: A(initial) → B → C(terminal), D(terminal)
**Transitions**:
- B→C external(guardA) where guardA.requires = [PaymentData]
- B→D external(guardB) where guardB.requires = [CancelRequest]

**Test: s10_multi_external_payment**
- startFlow → state = B
- resumeAndExecute with {PaymentData: "card"}
- Expect: guardA selected, state = C

**Test: s10_multi_external_cancel**
- startFlow → state = B
- resumeAndExecute with {CancelRequest: "user"}
- Expect: guardB selected, state = D

---

## S11: Per-State Timeout

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard, timeout=0ms)

**Test: s11_per_state_timeout_expired**
- startFlow → state = B
- Wait briefly (or set timeout=0)
- resumeAndExecute
- Expect: isCompleted = true, exitState = "EXPIRED"

---

## S12: TTL Expiration

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard)
**ttl = 0ms (immediate expiration)**

**Test: s12_ttl_expired**
- startFlow with ttl=0
- resumeAndExecute
- Expect: isCompleted = true, exitState = "EXPIRED"

---

## S13: Max Chain Depth

**States**: S1(initial) → S2 → S3 → ... → S12(terminal), maxChainDepth=3
**Transitions**: S1→S2 auto, S2→S3 auto, S3→S4 auto, S4→S5 auto...

**Test: s13_max_chain_depth**
- startFlow
- Expect: throws MAX_CHAIN_DEPTH error

---

## S14: Per-Guard Failure Count

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(myGuard), maxGuardRetries=5
**myGuard**: always Rejected

**Test: s14_per_guard_count**
- startFlow → state = B
- resumeAndExecute → rejected
- Expect: guardFailureCount = 1
- Expect: guardFailureCountFor("myGuard") = 1
- resumeAndExecute → rejected
- Expect: guardFailureCount = 2
- Expect: guardFailureCountFor("myGuard") = 2

---

## S15: guardFailureCount Reset on State Change

**States**: A(initial) → B → C → D(terminal)
**Transitions**: A→B auto(noop), B→C external(guardBC), C→D external(guardCD)
**guardBC**: first call Rejected, second call Accepted
**guardCD**: Accepted

**Test: s15_guard_count_reset**
- startFlow → state = B
- resumeAndExecute → rejected, guardFailureCount = 1
- resumeAndExecute → accepted, state = C, guardFailureCount = 0 (reset on state change)

---

## S16: SubFlow Basic

**States**: MAIN_A(initial) → MAIN_B → MAIN_C(terminal)
**SubFlow States**: SUB_X(initial) → SUB_Y(terminal)
**Transitions**: MAIN_A→subFlow(sub).onExit("SUB_Y", MAIN_B), MAIN_B→MAIN_C auto(noop)
**SubFlow**: SUB_X→SUB_Y auto(noop)

**Test: s16_subflow_completes**
- startFlow
- Sub-flow auto-chains: SUB_X→SUB_Y (complete)
- Maps SUB_Y → MAIN_B
- MAIN_B→MAIN_C auto
- Expect: currentState = MAIN_C, isCompleted = true

---

## S17: External with Processor

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard, postProcessor)
**guard**: returns Accepted({Validated: true})
**postProcessor**: requires [Validated], produces [Result], puts Result("done")

**Test: s17_external_with_processor**
- startFlow → state = B
- resumeAndExecute
- Expect: state = C
- Expect: context.get(Result) = "done"

---

## S18: allowPerpetual

**States**: A(initial) → B → A (cycle, no terminal)

**Test: s18_perpetual_builds_ok**
- Builder with allowPerpetual(), A→B auto, B→A external(guard)
- build() should NOT throw
- warnings should contain "liveness risk"

**Test: s18_perpetual_without_flag_fails**
- Same definition WITHOUT allowPerpetual()
- build() should throw "No path to terminal"

---

## S19: Validation Errors

**Test: s19_no_initial_state**
- All states have isInitial=false
- build() throws "No initial state found"

**Test: s19_unreachable_state**
- State X has no incoming transitions
- build() throws "State X is not reachable"

**Test: s19_auto_cycle**
- A→B auto, B→A auto
- build() throws "Auto/Branch transitions contain a cycle"

**Test: s19_auto_external_conflict**
- State B has both auto and external transitions
- build() throws "has both auto/branch and external transitions"

---

## S20: TERMINAL_ERROR (No Error Route)

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(failingProcessor)
**No onError defined**

**Test: s20_terminal_error**
- startFlow → processor throws
- Expect: isCompleted = true, exitState = "TERMINAL_ERROR"

---

# Plugin Scenarios

## S21: withPlugin Basic — Sub-Flow Insertion

**Main Flow States**: CREATED(initial) → PAYMENT → DONE(terminal)
**Transitions**: CREATED→PAYMENT auto(initProc), PAYMENT→DONE auto(finalProc)
**Plugin Flow States**: PL_INIT(initial) → PL_DONE(terminal)
**Plugin Transitions**: PL_INIT→PL_DONE auto(pluginProc)
**pluginProc**: puts PluginResult("validated")

**Setup**: mainDef.withPlugin(CREATED, PAYMENT, pluginDef)

**Test: s21_plugin_inserts_subflow**
- startFlow
- CREATED → sub-flow(PL_INIT→PL_DONE) → PAYMENT → DONE
- Expect: currentState = DONE, isCompleted = true
- Expect: context.get(PluginResult) = "validated" (plugin processor ran)

---

## S22: withPlugin Preserves Enter/Exit Actions

**Main Flow**: A(initial) → B → C(terminal)
**enterActions**: B → put(EnteredB, true)
**exitActions**: A → put(ExitedA, true)
**Plugin**: PL_A(initial) → PL_B(terminal), auto(noop)

**Setup**: mainDef.withPlugin(A, B, pluginDef) — inserts plugin before A→B

**Test: s22_plugin_preserves_actions**
- startFlow
- Expect: ExitedA = true (exit action still fires on A)
- Expect: EnteredB = true (enter action still fires on B)
- Expect: currentState = C

---

## S23: withPlugin Preserves Exception Routes

**Main Flow**: A(initial) → B → C(terminal), ERR(terminal)
**Transitions**: A→B auto(noop), B→C auto(failingProcessor)
**onStepError(B, SpecificError, ERR)**
**Plugin**: PL_A(initial) → PL_B(terminal), auto(noop) — inserted before A→B

**Test: s23_plugin_preserves_exception_routes**
- startFlow with withPlugin(A, B, pluginDef)
- Plugin completes, then B→C processor throws SpecificError
- Expect: state = ERR (exception route still works)

---

## S24: withPlugin with External Resume in Sub-Flow

**Main Flow**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C auto(noop)
**Plugin**: PL_A(initial) → PL_WAIT → PL_DONE(terminal)
**Plugin Transitions**: PL_A→PL_WAIT auto(noop), PL_WAIT→PL_DONE external(plGuard)
**plGuard**: requires [ApprovalData], returns Accepted

**Setup**: mainDef.withPlugin(A, B, pluginDef)

**Test: s24_plugin_external_resume**
- startFlow → sub-flow stops at PL_WAIT (external)
- Expect: not completed, waiting for external
- resumeAndExecute with {ApprovalData: "approved"}
- Sub-flow: PL_WAIT→PL_DONE (complete)
- Maps PL_DONE → B, then B→C auto
- Expect: currentState = C, isCompleted = true

---

## S25: Plugin Registry — Analysis Plugin

**Setup**: PluginRegistry with PolicyLintPlugin
**Flow**: Any valid flow definition

**Test: s25_analysis_plugin_runs**
- registry.analyzeAll(definition)
- Expect: returns PluginReport with results from lint plugin
- Expect: no exception thrown for valid flow

---

## S26: Plugin Registry — Store Plugin Wrapping

**Setup**: PluginRegistry with AuditStorePlugin
**Flow**: A(initial) → B(terminal), auto chain

**Test: s26_store_plugin_wraps**
- wrappedStore = registry.applyStorePlugins(baseStore)
- Run flow through engine with wrappedStore
- Expect: audit records captured (store was wrapped)

---

## S27: Plugin Registry — Engine Plugin Installation

**Setup**: PluginRegistry with ObservabilityEnginePlugin

**Test: s27_engine_plugin_installs**
- registry.installEnginePlugins(engine)
- Run flow
- Expect: no exception, loggers installed by plugin

---

## S28: Idempotency Plugin

**States**: A(initial) → B → C(terminal)
**Transitions**: A→B auto(noop), B→C external(guard)
**Plugin**: IdempotencyRuntimePlugin with idempotencyKey = requestId

**Test: s28_idempotency_dedup**
- startFlow, resumeAndExecute → complete (state = C)
- resumeAndExecute with same requestId
- Expect: returns cached result, no duplicate processing

---

## S29: EventStore Plugin — Replay

**Setup**: EventLogStorePlugin wrapping base store

**Test: s29_eventstore_replay**
- Run flow to completion (multiple transitions)
- Replay from event log
- Expect: same final state reached

---

## S30: withPlugin Name Convention

**Test: s30_plugin_name**
- mainDef.name = "order"
- pluginDef.name = "validation"
- extended = mainDef.withPlugin(A, B, pluginDef)
- Expect: extended.name = "order+plugin:validation"
