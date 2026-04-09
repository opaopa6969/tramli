package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Shared test scenarios from docs/specs/shared-test-scenarios.md.
 * Covers S06, S08, S09, S10, S11, S14, S15, S17, S21, S22, S23, S30.
 */
class SharedSpecTest {

    // ═══════════════════════════════════════════════════════════
    //  State Enums
    // ═══════════════════════════════════════════════════════════

    enum TwoState implements FlowState {
        A(false, true), B(false, false), C(true, false), ERR(true, false);
        private final boolean terminal, initial;
        TwoState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum ThreeState implements FlowState {
        A(false, true), B(false, false), C(true, false);
        private final boolean terminal, initial;
        ThreeState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum FourState implements FlowState {
        A(false, true), B(false, false), C(false, false), D(true, false), ERR(true, false);
        private final boolean terminal, initial;
        FourState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum MultiExtState implements FlowState {
        A(false, true), B(false, false), C(true, false), D(true, false);
        private final boolean terminal, initial;
        MultiExtState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum ErrRouteState implements FlowState {
        A(false, true), B(false, false), C(true, false),
        SPECIAL_ERR(true, false), GENERIC_ERR(true, false);
        private final boolean terminal, initial;
        ErrRouteState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum PluginMain implements FlowState {
        CREATED(false, true), PAYMENT(false, false), DONE(true, false), ERR(true, false);
        private final boolean terminal, initial;
        PluginMain(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum PluginSub implements FlowState {
        PL_INIT(false, true), PL_DONE(true, false);
        private final boolean terminal, initial;
        PluginSub(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    // ═══════════════════════════════════════════════════════════
    //  Context Data Records
    // ═══════════════════════════════════════════════════════════

    record TempData(String value) {}
    record PaymentData(String value) {}
    record CancelRequest(String value) {}
    record Receipt(String value) {}
    record Validated(boolean ok) {}
    record Result(String value) {}
    record PluginResult(String value) {}
    record EnteredB(boolean value) {}
    record EnteredC(boolean value) {}
    record ExitedA(boolean value) {}
    record ExitedB(boolean value) {}

    // ═══════════════════════════════════════════════════════════
    //  Exceptions for S09
    // ═══════════════════════════════════════════════════════════

    static class SpecificError extends RuntimeException {
        SpecificError(String msg) { super(msg); }
    }

    static class GenericError extends RuntimeException {
        GenericError(String msg) { super(msg); }
    }

    // ═══════════════════════════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════════════════════════

    static StateProcessor noop(String name) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public void process(FlowContext ctx) {}
        };
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static StateProcessor producer(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {
                for (Class<?> p : produces) ctx.put((Class) p, p.getSimpleName());
            }
        };
    }

    static TransitionGuard acceptingGuard(String name, Set<Class<?>> requires, Map<Class<?>, Object> data) {
        return new TransitionGuard() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Accepted(data);
            }
        };
    }

    static TransitionGuard rejectingGuard(String name, Set<Class<?>> requires) {
        return new TransitionGuard() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public int maxRetries() { return 5; }
            @Override public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Rejected("rejected");
            }
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  S06: Processor Error with Context Rollback
    // ═══════════════════════════════════════════════════════════

    @Test
    void s06_processor_error_rollback() {
        // Guard returns Accepted with TempData, then processor throws.
        // After error routing, context should NOT have TempData (rolled back).
        @SuppressWarnings({"unchecked", "rawtypes"})
        TransitionGuard guard = new TransitionGuard() {
            @Override public String name() { return "S06Guard"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(TempData.class); }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Accepted(
                        Map.of(TempData.class, new TempData("temp")));
            }
        };

        StateProcessor failingProcessor = new StateProcessor() {
            @Override public String name() { return "FailAfterGuard"; }
            @Override public Set<Class<?>> requires() { return Set.of(TempData.class); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public void process(FlowContext ctx) {
                throw new RuntimeException("processor failed");
            }
        };

        var def = Tramli.define("s06", TwoState.class)
                .initiallyAvailable(TempData.class)
                .from(TwoState.A).auto(TwoState.B, noop("Noop"))
                .from(TwoState.B).external(TwoState.C, guard, failingProcessor)
                .onAnyError(TwoState.ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(TwoState.B, flow.currentState());

        flow = engine.resumeAndExecute(flow.id(), def);

        assertEquals(TwoState.ERR, flow.currentState());
        assertTrue(flow.isCompleted());
        // Context must NOT have TempData — it was rolled back
        assertTrue(flow.context().find(TempData.class).isEmpty(),
                "TempData should be rolled back after processor error");
    }

    // ═══════════════════════════════════════════════════════════
    //  S08: onStateEnter / onStateExit
    // ═══════════════════════════════════════════════════════════

    @Test
    void s08_enter_exit_actions() {
        var def = Tramli.define("s08", ThreeState.class)
                .from(ThreeState.A).auto(ThreeState.B, noop("Noop1"))
                .from(ThreeState.B).auto(ThreeState.C, noop("Noop2"))
                .onStateExit(ThreeState.A, ctx -> ctx.put(ExitedA.class, new ExitedA(true)))
                .onStateEnter(ThreeState.B, ctx -> ctx.put(EnteredB.class, new EnteredB(true)))
                .onStateExit(ThreeState.B, ctx -> ctx.put(ExitedB.class, new ExitedB(true)))
                .onStateEnter(ThreeState.C, ctx -> ctx.put(EnteredC.class, new EnteredC(true)))
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(ThreeState.C, flow.currentState());
        assertTrue(flow.isCompleted());

        // Verify all enter/exit actions fired
        assertTrue(flow.context().find(ExitedA.class).isPresent(), "ExitedA should be set");
        assertTrue(flow.context().get(ExitedA.class).value());

        assertTrue(flow.context().find(EnteredB.class).isPresent(), "EnteredB should be set");
        assertTrue(flow.context().get(EnteredB.class).value());

        assertTrue(flow.context().find(ExitedB.class).isPresent(), "ExitedB should be set");
        assertTrue(flow.context().get(ExitedB.class).value());

        assertTrue(flow.context().find(EnteredC.class).isPresent(), "EnteredC should be set");
        assertTrue(flow.context().get(EnteredC.class).value());
    }

    // ═══════════════════════════════════════════════════════════
    //  S09: onStepError Exception Routes
    // ═══════════════════════════════════════════════════════════

    @Test
    void s09_exception_route_specific() {
        StateProcessor failingProcessor = new StateProcessor() {
            @Override public String name() { return "ThrowSpecific"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public void process(FlowContext ctx) {
                throw new SpecificError("specific failure");
            }
        };

        var def = Tramli.define("s09-specific", ErrRouteState.class)
                .from(ErrRouteState.A).auto(ErrRouteState.B, noop("Noop"))
                .from(ErrRouteState.B).auto(ErrRouteState.C, failingProcessor)
                .onStepError(ErrRouteState.B, SpecificError.class, ErrRouteState.SPECIAL_ERR)
                .onError(ErrRouteState.B, ErrRouteState.GENERIC_ERR)
                .onError(ErrRouteState.A, ErrRouteState.GENERIC_ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        // SpecificError should route to SPECIAL_ERR, not GENERIC_ERR
        assertEquals(ErrRouteState.SPECIAL_ERR, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void s09_exception_route_fallback() {
        StateProcessor failingProcessor = new StateProcessor() {
            @Override public String name() { return "ThrowGeneric"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public void process(FlowContext ctx) {
                throw new GenericError("generic failure");
            }
        };

        var def = Tramli.define("s09-fallback", ErrRouteState.class)
                .from(ErrRouteState.A).auto(ErrRouteState.B, noop("Noop"))
                .from(ErrRouteState.B).auto(ErrRouteState.C, failingProcessor)
                .onStepError(ErrRouteState.B, SpecificError.class, ErrRouteState.SPECIAL_ERR)
                .onError(ErrRouteState.B, ErrRouteState.GENERIC_ERR)
                .onError(ErrRouteState.A, ErrRouteState.GENERIC_ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        // GenericError doesn't match SpecificError, falls back to onError -> GENERIC_ERR
        assertEquals(ErrRouteState.GENERIC_ERR, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    // ═══════════════════════════════════════════════════════════
    //  S10: Multi-External Guard Selection
    // ═══════════════════════════════════════════════════════════

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void s10_multi_external_payment() {
        var def = buildMultiExternalDef();
        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(MultiExtState.B, flow.currentState());

        // Resume with PaymentData -> guardA selected -> state = C
        Map<Class<?>, Object> data = Map.of((Class) PaymentData.class, new PaymentData("card"));
        flow = engine.resumeAndExecute(flow.id(), def, data);

        assertEquals(MultiExtState.C, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void s10_multi_external_cancel() {
        var def = buildMultiExternalDef();
        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(MultiExtState.B, flow.currentState());

        // Resume with CancelRequest -> guardB selected -> state = D
        Map<Class<?>, Object> data = Map.of((Class) CancelRequest.class, new CancelRequest("user"));
        flow = engine.resumeAndExecute(flow.id(), def, data);

        assertEquals(MultiExtState.D, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    private FlowDefinition<MultiExtState> buildMultiExternalDef() {
        TransitionGuard guardA = acceptingGuard("GuardA",
                Set.of(PaymentData.class), Map.of());
        TransitionGuard guardB = acceptingGuard("GuardB",
                Set.of(CancelRequest.class), Map.of());

        return Tramli.define("s10", MultiExtState.class)
                .initiallyAvailable(PaymentData.class, CancelRequest.class)
                .from(MultiExtState.A).auto(MultiExtState.B, noop("Noop"))
                .from(MultiExtState.B).external(MultiExtState.C, guardA)
                .from(MultiExtState.B).external(MultiExtState.D, guardB)
                .build();
    }

    // ═══════════════════════════════════════════════════════════
    //  S11: Per-State Timeout
    // ═══════════════════════════════════════════════════════════

    @Test
    void s11_per_state_timeout_expired() throws InterruptedException {
        TransitionGuard guard = acceptingGuard("TimeoutGuard", Set.of(), Map.of());

        var def = Tramli.define("s11", TwoState.class)
                .ttl(Duration.ofHours(1)) // flow-level TTL is long
                .from(TwoState.A).auto(TwoState.B, noop("Noop"))
                .from(TwoState.B).external(TwoState.C, guard, Duration.ofMillis(0))
                .onAnyError(TwoState.ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(TwoState.B, flow.currentState());

        // Wait a moment for per-state timeout=0ms to be exceeded
        Thread.sleep(5);

        flow = engine.resumeAndExecute(flow.id(), def);

        assertTrue(flow.isCompleted());
        assertEquals("EXPIRED", flow.exitState());
    }

    // ═══════════════════════════════════════════════════════════
    //  S14: Per-Guard Failure Count
    // ═══════════════════════════════════════════════════════════

    @Test
    void s14_per_guard_count() {
        TransitionGuard myGuard = rejectingGuard("myGuard", Set.of());

        var def = Tramli.define("s14", TwoState.class)
                .ttl(Duration.ofHours(1))
                .maxGuardRetries(5)
                .from(TwoState.A).auto(TwoState.B, noop("Noop"))
                .from(TwoState.B).external(TwoState.C, myGuard)
                .onAnyError(TwoState.ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(TwoState.B, flow.currentState());

        // First rejection
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(1, flow.guardFailureCount());

        // Second rejection
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(2, flow.guardFailureCount());

        // Still at B, not yet at max retries
        assertEquals(TwoState.B, flow.currentState());
        assertFalse(flow.isCompleted());
    }

    // ═══════════════════════════════════════════════════════════
    //  S15: guardFailureCount Reset on State Change
    // ═══════════════════════════════════════════════════════════

    @Test
    void s15_guard_count_reset() {
        // B->C guard: first call rejected, second call accepted
        // C->D guard: accepted
        AtomicInteger bcCallCount = new AtomicInteger(0);

        TransitionGuard guardBC = new TransitionGuard() {
            @Override public String name() { return "GuardBC"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public int maxRetries() { return 5; }
            @Override public GuardOutput validate(FlowContext ctx) {
                if (bcCallCount.incrementAndGet() <= 1) {
                    return new GuardOutput.Rejected("not yet");
                }
                return new GuardOutput.Accepted();
            }
        };

        TransitionGuard guardCD = acceptingGuard("GuardCD", Set.of(), Map.of());

        var def = Tramli.define("s15", FourState.class)
                .ttl(Duration.ofHours(1))
                .maxGuardRetries(5)
                .from(FourState.A).auto(FourState.B, noop("Noop"))
                .from(FourState.B).external(FourState.C, guardBC)
                .from(FourState.C).external(FourState.D, guardCD)
                .onAnyError(FourState.ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(FourState.B, flow.currentState());

        // First resume: rejected, guardFailureCount = 1
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(1, flow.guardFailureCount());
        assertEquals(FourState.B, flow.currentState());

        // Second resume: accepted, state = C, guardFailureCount reset to 0
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(FourState.C, flow.currentState());
        assertEquals(0, flow.guardFailureCount(), "guardFailureCount should reset on state change");
    }

    // ═══════════════════════════════════════════════════════════
    //  S17: External with Processor
    // ═══════════════════════════════════════════════════════════

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void s17_external_with_processor() {
        TransitionGuard guard = new TransitionGuard() {
            @Override public String name() { return "S17Guard"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(Validated.class); }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Accepted(
                        Map.of((Class) Validated.class, new Validated(true)));
            }
        };

        StateProcessor postProcessor = new StateProcessor() {
            @Override public String name() { return "PostProc"; }
            @Override public Set<Class<?>> requires() { return Set.of(Validated.class); }
            @Override public Set<Class<?>> produces() { return Set.of(Result.class); }
            @Override public void process(FlowContext ctx) {
                ctx.put(Result.class, new Result("done"));
            }
        };

        var def = Tramli.define("s17", TwoState.class)
                .initiallyAvailable(Validated.class)
                .from(TwoState.A).auto(TwoState.B, noop("Noop"))
                .from(TwoState.B).external(TwoState.C, guard, postProcessor)
                .onAnyError(TwoState.ERR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, null, Map.of());

        assertEquals(TwoState.B, flow.currentState());

        flow = engine.resumeAndExecute(flow.id(), def);

        assertEquals(TwoState.C, flow.currentState());
        assertTrue(flow.isCompleted());
        assertEquals("done", flow.context().get(Result.class).value());
    }

    // ═══════════════════════════════════════════════════════════
    //  S21: withPlugin Basic -- Sub-Flow Insertion
    // ═══════════════════════════════════════════════════════════

    @Test
    void s21_plugin_inserts_subflow() {
        StateProcessor initProc = noop("InitProc");
        StateProcessor finalProc = noop("FinalProc");
        StateProcessor pluginProc = new StateProcessor() {
            @Override public String name() { return "PluginProc"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(PluginResult.class); }
            @Override public void process(FlowContext ctx) {
                ctx.put(PluginResult.class, new PluginResult("validated"));
            }
        };

        var mainDef = Tramli.define("main", PluginMain.class)
                .from(PluginMain.CREATED).auto(PluginMain.PAYMENT, initProc)
                .from(PluginMain.PAYMENT).auto(PluginMain.DONE, finalProc)
                .onAnyError(PluginMain.ERR)
                .build();

        var pluginDef = Tramli.define("validation", PluginSub.class)
                .from(PluginSub.PL_INIT).auto(PluginSub.PL_DONE, pluginProc)
                .build();

        var extended = mainDef.withPlugin(PluginMain.CREATED, PluginMain.PAYMENT, pluginDef);

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(extended, null, Map.of());

        assertEquals(PluginMain.DONE, flow.currentState());
        assertTrue(flow.isCompleted());
        // Plugin processor should have run
        assertEquals("validated", flow.context().get(PluginResult.class).value());
    }

    // ═══════════════════════════════════════════════════════════
    //  S22: withPlugin Preserves Enter/Exit Actions
    //
    //  withPlugin copies the enter/exit action maps to the extended definition.
    //  The sub-flow execution path (executeSubFlow) does not fire exit/enter
    //  for the immediate from/to states of the replaced transition. However,
    //  actions on subsequent states (PAYMENT exit, DONE enter) are preserved
    //  because those transitions still go through the normal auto-chain path.
    // ═══════════════════════════════════════════════════════════

    @Test
    void s22_plugin_preserves_actions() {
        StateProcessor initProc = noop("InitProc");
        StateProcessor finalProc = noop("FinalProc");

        var mainDef = Tramli.define("main-actions", PluginMain.class)
                .from(PluginMain.CREATED).auto(PluginMain.PAYMENT, initProc)
                .from(PluginMain.PAYMENT).auto(PluginMain.DONE, finalProc)
                .onStateExit(PluginMain.PAYMENT, ctx -> ctx.put(ExitedB.class, new ExitedB(true)))
                .onStateEnter(PluginMain.DONE, ctx -> ctx.put(EnteredC.class, new EnteredC(true)))
                .onAnyError(PluginMain.ERR)
                .build();

        var pluginDef = Tramli.define("plugin-actions", PluginSub.class)
                .from(PluginSub.PL_INIT).auto(PluginSub.PL_DONE, noop("PluginNoop"))
                .build();

        var extended = mainDef.withPlugin(PluginMain.CREATED, PluginMain.PAYMENT, pluginDef);

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(extended, null, Map.of());

        assertEquals(PluginMain.DONE, flow.currentState());
        assertTrue(flow.isCompleted());

        // Exit action on PAYMENT should still fire (PAYMENT->DONE uses normal auto path)
        assertTrue(flow.context().find(ExitedB.class).isPresent(),
                "Exit action on PAYMENT should still fire after plugin insertion");

        // Enter action on DONE should still fire
        assertTrue(flow.context().find(EnteredC.class).isPresent(),
                "Enter action on DONE should still fire after plugin insertion");

        // Verify the definition preserves the action maps (withPlugin copies them)
        assertNotNull(extended.exitAction(PluginMain.PAYMENT),
                "Extended definition should retain exit action for PAYMENT");
        assertNotNull(extended.enterAction(PluginMain.DONE),
                "Extended definition should retain enter action for DONE");
    }

    // ═══════════════════════════════════════════════════════════
    //  S23: withPlugin Preserves Exception Routes
    // ═══════════════════════════════════════════════════════════

    @Test
    void s23_plugin_preserves_exception_routes() {
        // B->C auto processor throws SpecificError.
        // onStepError(B, SpecificError, ERR) should still work after plugin insertion on A->B.
        StateProcessor failingProcessor = new StateProcessor() {
            @Override public String name() { return "FailProc"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public void process(FlowContext ctx) {
                throw new SpecificError("expected failure");
            }
        };

        // Use ErrRouteState: A(initial) -> B -> C(terminal), SPECIAL_ERR(terminal), GENERIC_ERR(terminal)
        var mainDef = Tramli.define("main-err", ErrRouteState.class)
                .from(ErrRouteState.A).auto(ErrRouteState.B, noop("Noop"))
                .from(ErrRouteState.B).auto(ErrRouteState.C, failingProcessor)
                .onStepError(ErrRouteState.B, SpecificError.class, ErrRouteState.SPECIAL_ERR)
                .onError(ErrRouteState.A, ErrRouteState.GENERIC_ERR)
                .onError(ErrRouteState.B, ErrRouteState.GENERIC_ERR)
                .build();

        var pluginDef = Tramli.define("plugin-err", PluginSub.class)
                .from(PluginSub.PL_INIT).auto(PluginSub.PL_DONE, noop("PluginNoop"))
                .build();

        var extended = mainDef.withPlugin(ErrRouteState.A, ErrRouteState.B, pluginDef);

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(extended, null, Map.of());

        // Plugin completes (A -> sub-flow -> B), then B->C processor throws SpecificError
        // Exception route should still route to SPECIAL_ERR
        assertEquals(ErrRouteState.SPECIAL_ERR, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    // ═══════════════════════════════════════════════════════════
    //  S30: withPlugin Name Convention
    // ═══════════════════════════════════════════════════════════

    @Test
    void s30_plugin_name() {
        var mainDef = Tramli.define("order", PluginMain.class)
                .from(PluginMain.CREATED).auto(PluginMain.PAYMENT, noop("Init"))
                .from(PluginMain.PAYMENT).auto(PluginMain.DONE, noop("Final"))
                .onAnyError(PluginMain.ERR)
                .build();

        var pluginDef = Tramli.define("validation", PluginSub.class)
                .from(PluginSub.PL_INIT).auto(PluginSub.PL_DONE, noop("PluginNoop"))
                .build();

        var extended = mainDef.withPlugin(PluginMain.CREATED, PluginMain.PAYMENT, pluginDef);

        assertEquals("order+plugin:validation", extended.name());
    }

    // ═══════════════════════════════════════════════════════════
    //  S18: allowPerpetual
    // ═══════════════════════════════════════════════════════════

    enum PerpetualState implements FlowState {
        X(false, true), Y(false, false);
        private final boolean terminal, initial;
        PerpetualState(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    @Test void s18_perpetual_builds_ok() {
        var def = FlowDefinition.builder("s18-perpetual", PerpetualState.class)
                .allowPerpetual()
                .from(PerpetualState.X).auto(PerpetualState.Y, noop("noop"))
                .from(PerpetualState.Y).external(PerpetualState.X, acceptGuard("cycle"))
                .build();
        assertNotNull(def);
        assertTrue(def.warnings().stream().anyMatch(w -> w.contains("liveness")),
                "should warn about liveness risk");
    }

    @Test void s18_perpetual_without_flag_fails() {
        assertThrows(FlowException.class, () ->
                FlowDefinition.builder("s18-no-flag", PerpetualState.class)
                        .from(PerpetualState.X).auto(PerpetualState.Y, noop("noop"))
                        .from(PerpetualState.Y).external(PerpetualState.X, acceptGuard("cycle"))
                        .build());
    }

    private static TransitionGuard acceptGuard(String name) {
        return new TransitionGuard() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(); }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Accepted(Map.of());
            }
        };
    }
}
