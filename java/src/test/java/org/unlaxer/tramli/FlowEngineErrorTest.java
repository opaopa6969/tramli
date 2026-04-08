package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class FlowEngineErrorTest {

    // ─── Minimal state enums per test scenario ───────────────

    enum TwoStep implements FlowState {
        INIT(false, true), DONE(true, false), ERROR(true, false);
        private final boolean terminal, initial;
        TwoStep(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum WithWait implements FlowState {
        INIT(false, true), WAIT(false, false), DONE(true, false), ERROR(true, false);
        private final boolean terminal, initial;
        WithWait(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum Chain implements FlowState {
        INIT(false, true), A(false, false), B(false, false), C(false, false),
        DONE(true, false), ERROR(true, false);
        private final boolean terminal, initial;
        Chain(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    enum Conflict implements FlowState {
        INIT(false, true), A(false, false), B(false, false),
        DONE(true, false), ERROR(true, false);
        private final boolean terminal, initial;
        Conflict(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    // ─── Context data ────────────────────────────────────────

    record Input(String value) {}
    record Middle(String value) {}

    // ─── Helpers ─────────────────────────────────────────────

    @SuppressWarnings({"unchecked", "rawtypes"})
    static StateProcessor ok(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {
                for (Class<?> p : produces) ctx.put((Class) p, p.getSimpleName());
            }
        };
    }

    static StateProcessor failing(String name, Set<Class<?>> requires) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return Set.of(Middle.class); }
            @Override public void process(FlowContext ctx) {
                ctx.put(Middle.class, new Middle("dirty"));
                throw new RuntimeException("processor failed");
            }
        };
    }

    // ─── Tests ───────────────────────────────────────────────

    @Test
    void processorThrows_routesToErrorState() {
        var def = Tramli.define("err1", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).auto(TwoStep.DONE, failing("FailProc", Set.of(Input.class)))
                .onAnyError(TwoStep.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        assertEquals(TwoStep.ERROR, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void processorThrows_contextIsRestored() {
        var def = Tramli.define("err2", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).auto(TwoStep.DONE, failing("FailProc", Set.of(Input.class)))
                .onAnyError(TwoStep.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        assertTrue(flow.context().find(Middle.class).isEmpty(),
                "Context should be restored after processor failure");
        assertTrue(flow.context().find(Input.class).isPresent());
    }

    @Test
    void branchReturnsUnknownLabel_routesToErrorState() {
        BranchProcessor badBranch = new BranchProcessor() {
            @Override public String name() { return "BadBranch"; }
            @Override public Set<Class<?>> requires() { return Set.of(Input.class); }
            @Override public String decide(FlowContext ctx) { return "nonexistent"; }
        };

        var def = Tramli.define("err3", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).branch(badBranch)
                    .to(TwoStep.DONE, "ok")
                    .to(TwoStep.ERROR, "fail")
                    .endBranch()
                .onAnyError(TwoStep.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        assertEquals(TwoStep.ERROR, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void longAutoChain_completesSuccessfully() {
        var def = Tramli.define("chain", Chain.class)
                .initiallyAvailable(Input.class)
                .from(Chain.INIT).auto(Chain.A, ok("p1", Set.of(Input.class), Set.of()))
                .from(Chain.A).auto(Chain.B, ok("p2", Set.of(), Set.of()))
                .from(Chain.B).auto(Chain.C, ok("p3", Set.of(), Set.of()))
                .from(Chain.C).auto(Chain.DONE, ok("p4", Set.of(), Set.of()))
                .onAnyError(Chain.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        assertEquals(Chain.DONE, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void ttlExpired_resumeCompletesAsExpired() throws InterruptedException {
        var def = Tramli.define("ttl", WithWait.class)
                .ttl(Duration.ofMillis(1))
                .initiallyAvailable(Input.class)
                .from(WithWait.INIT).auto(WithWait.WAIT, ok("p1", Set.of(Input.class), Set.of(Middle.class)))
                .from(WithWait.WAIT).external(WithWait.DONE, new TransitionGuard() {
                    @Override public String name() { return "G"; }
                    @Override public Set<Class<?>> requires() { return Set.of(Middle.class); }
                    @Override public Set<Class<?>> produces() { return Set.of(); }
                    @Override public int maxRetries() { return 1; }
                    @Override public GuardOutput validate(FlowContext ctx) {
                        return new GuardOutput.Accepted();
                    }
                })
                .onAnyError(WithWait.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        Thread.sleep(10);

        var resumed = engine.resumeAndExecute(flow.id(), def);
        assertEquals("EXPIRED", resumed.exitState());
        assertTrue(resumed.isCompleted());
    }

    @Test
    void guardRejectedMaxRetries_routesToErrorState() {
        var def = Tramli.define("reject", WithWait.class)
                .ttl(Duration.ofHours(1))
                .maxGuardRetries(2)
                .initiallyAvailable(Input.class)
                .from(WithWait.INIT).auto(WithWait.WAIT, ok("p1", Set.of(Input.class), Set.of(Middle.class)))
                .from(WithWait.WAIT).external(WithWait.DONE, new TransitionGuard() {
                    @Override public String name() { return "AlwaysReject"; }
                    @Override public Set<Class<?>> requires() { return Set.of(Middle.class); }
                    @Override public Set<Class<?>> produces() { return Set.of(); }
                    @Override public int maxRetries() { return 2; }
                    @Override public GuardOutput validate(FlowContext ctx) {
                        return new GuardOutput.Rejected("nope");
                    }
                })
                .onAnyError(WithWait.ERROR)
                .build();

        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        var r1 = engine.resumeAndExecute(flow.id(), def);
        assertEquals(WithWait.WAIT, r1.currentState());
        assertFalse(r1.isCompleted());

        var r2 = engine.resumeAndExecute(flow.id(), def);
        assertEquals(WithWait.ERROR, r2.currentState());
        assertTrue(r2.isCompleted());
    }

    @Test
    void autoAndExternalConflict_buildFails() {
        var ex = assertThrows(FlowException.class, () ->
                Tramli.define("conflict", Conflict.class)
                        .initiallyAvailable(Input.class)
                        .from(Conflict.INIT).auto(Conflict.A, ok("p1", Set.of(Input.class), Set.of()))
                        .from(Conflict.A).auto(Conflict.B, ok("p2", Set.of(), Set.of()))
                        .from(Conflict.A).external(Conflict.DONE, new TransitionGuard() {
                            @Override public String name() { return "G"; }
                            @Override public Set<Class<?>> requires() { return Set.of(); }
                            @Override public Set<Class<?>> produces() { return Set.of(); }
                            @Override public int maxRetries() { return 1; }
                            @Override public GuardOutput validate(FlowContext ctx) {
                                return new GuardOutput.Accepted();
                            }
                        })
                        .from(Conflict.B).auto(Conflict.DONE, ok("p3", Set.of(), Set.of()))
                        .onAnyError(Conflict.ERROR)
                        .build());

        assertEquals("INVALID_FLOW_DEFINITION", ex.code());
        assertTrue(ex.getMessage().contains("auto/branch and external"));
    }

    // ─── SubFlow Tests ────────────────────────────────────────

    enum SubStep implements FlowState {
        S_INIT(false, true), S_PROCESS(false, false), S_DONE(true, false);
        private final boolean terminal, initial;
        SubStep(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record SubInput(String v) {}
    record SubOutput(String v) {}

    @Test
    void basicSubFlow_autoChainThroughSubFlow() {
        // Sub-flow: S_INIT → auto → S_PROCESS → auto → S_DONE
        var subDef = Tramli.define("sub", SubStep.class)
                .initiallyAvailable(Input.class)
                .from(SubStep.S_INIT).auto(SubStep.S_PROCESS, ok("SubP1", Set.of(Input.class), Set.of(SubOutput.class)))
                .from(SubStep.S_PROCESS).auto(SubStep.S_DONE, ok("SubP2", Set.of(SubOutput.class), Set.of()))
                .build();

        // Main: INIT → subFlow(sub) → onExit("S_DONE", DONE)
        var mainDef = Tramli.define("main", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).subFlow(subDef).onExit("S_DONE", TwoStep.DONE).endSubFlow()
                .onAnyError(TwoStep.ERROR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(mainDef, "s1", Map.of(Input.class, new Input("x")));

        // Should auto-chain through sub-flow and reach DONE
        assertEquals(TwoStep.DONE, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void subFlowWithExternal_stopsAndResumes() {
        // Sub-flow: S_INIT → auto → S_PROCESS → external(S_DONE, guard)
        var subDef = Tramli.define("sub-ext", SubStep.class)
                .initiallyAvailable(Input.class)
                .from(SubStep.S_INIT).auto(SubStep.S_PROCESS, ok("SubP1", Set.of(Input.class), Set.of(SubOutput.class)))
                .from(SubStep.S_PROCESS).external(SubStep.S_DONE, new TransitionGuard() {
                    @Override public String name() { return "SubGuard"; }
                    @Override public Set<Class<?>> requires() { return Set.of(SubOutput.class); }
                    @Override public Set<Class<?>> produces() { return Set.of(); }
                    @Override public int maxRetries() { return 3; }
                    @Override public GuardOutput validate(FlowContext ctx) {
                        return new GuardOutput.Accepted();
                    }
                })
                .build();

        var mainDef = Tramli.define("main-ext", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).subFlow(subDef).onExit("S_DONE", TwoStep.DONE).endSubFlow()
                .onAnyError(TwoStep.ERROR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(mainDef, "s1", Map.of(Input.class, new Input("x")));

        // Should stop at sub-flow's external
        assertEquals(TwoStep.INIT, flow.currentState()); // parent still at INIT
        assertNotNull(flow.activeSubFlow()); // sub-flow is active
        assertFalse(flow.isCompleted());

        // Resume — guard accepts → sub-flow completes → parent transitions to DONE
        var resumed = engine.resumeAndExecute(flow.id(), mainDef);
        assertEquals(TwoStep.DONE, resumed.currentState());
        assertTrue(resumed.isCompleted());
        assertNull(resumed.activeSubFlow());
    }

    enum SubSimple implements FlowState {
        SS_INIT(false, true), SS_DONE(true, false);
        private final boolean terminal, initial;
        SubSimple(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    @Test
    void subFlowExitMissing_buildFails() {
        var subDef = Tramli.define("sub-incomplete", SubSimple.class)
                .from(SubSimple.SS_INIT).auto(SubSimple.SS_DONE, ok("P", Set.of(), Set.of()))
                .build();

        // Missing onExit for "SS_DONE"
        assertThrows(FlowException.class, () ->
                Tramli.define("bad", TwoStep.class)
                        .from(TwoStep.INIT).subFlow(subDef).endSubFlow() // no onExit!
                        .onAnyError(TwoStep.ERROR)
                        .build());
    }

    // ─── Error Path Data-Flow Analysis ──────────────────────

    enum ErrorPath implements FlowState {
        START(false, true), MID(false, false), ERR(false, false), DONE(true, false);
        private final boolean terminal, initial;
        ErrorPath(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record ErrInput(String v) {}
    record ErrMiddle(String v) {}

    @Test
    void errorPathRequiresUnsatisfied_buildFails() {
        // ERR state has a processor that requires ErrMiddle,
        // but ErrMiddle is only produced by the processor at START→MID.
        // If that processor fails, ErrMiddle is NOT available.
        // Error path: START→ERR (error), ERR processor requires ErrMiddle → build should fail.
        var ex = assertThrows(FlowException.class, () ->
                Tramli.define("errpath", ErrorPath.class)
                        .initiallyAvailable(ErrInput.class)
                        .from(ErrorPath.START).auto(ErrorPath.MID,
                                ok("P1", Set.of(ErrInput.class), Set.of(ErrMiddle.class)))
                        .from(ErrorPath.MID).auto(ErrorPath.DONE,
                                ok("P2", Set.of(ErrMiddle.class), Set.of()))
                        .onError(ErrorPath.START, ErrorPath.ERR)
                        .from(ErrorPath.ERR).auto(ErrorPath.DONE,
                                ok("ErrProc", Set.of(ErrMiddle.class), Set.of()))
                        .build());

        assertTrue(ex.getMessage().contains("ErrMiddle"));
        assertTrue(ex.getMessage().contains("may not be available"));
    }

    @Test
    void errorPathToTerminal_buildSucceeds() {
        // Error target is terminal — no processor requirements to check
        var def = Tramli.define("errterm", TwoStep.class)
                .initiallyAvailable(Input.class)
                .from(TwoStep.INIT).auto(TwoStep.DONE,
                        ok("P1", Set.of(Input.class), Set.of(Middle.class)))
                .onAnyError(TwoStep.ERROR)
                .build();

        assertNotNull(def);
    }

    // ─── Exception-typed error routing ──────────────────

    static class RetriableException extends RuntimeException {
        RetriableException(String msg) { super(msg); }
    }
    static class FatalException extends RuntimeException {
        FatalException(String msg) { super(msg); }
    }

    enum ThreeWayError implements FlowState {
        INIT(false, true), DONE(true, false),
        RETRY(true, false), FATAL(true, false), FALLBACK(true, false);
        private final boolean terminal, initial;
        ThreeWayError(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    @Test
    void onStepError_routesByExceptionType() {
        var def = Tramli.define("typed-error", ThreeWayError.class)
                .initiallyAvailable(Input.class)
                .from(ThreeWayError.INIT).auto(ThreeWayError.DONE,
                        new StateProcessor() {
                            @Override public String name() { return "Failing"; }
                            @Override public Set<Class<?>> requires() { return Set.of(Input.class); }
                            @Override public Set<Class<?>> produces() { return Set.of(); }
                            @Override public void process(FlowContext ctx) {
                                throw new RetriableException("timeout");
                            }
                        })
                .onStepError(ThreeWayError.INIT, RetriableException.class, ThreeWayError.RETRY)
                .onStepError(ThreeWayError.INIT, FatalException.class, ThreeWayError.FATAL)
                .onAnyError(ThreeWayError.FALLBACK)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        // RetriableException → RETRY (not FALLBACK)
        assertEquals(ThreeWayError.RETRY, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    @Test
    void onStepError_fallsBackToOnError() {
        var def = Tramli.define("fallback-error", ThreeWayError.class)
                .initiallyAvailable(Input.class)
                .from(ThreeWayError.INIT).auto(ThreeWayError.DONE,
                        new StateProcessor() {
                            @Override public String name() { return "Failing"; }
                            @Override public Set<Class<?>> requires() { return Set.of(Input.class); }
                            @Override public Set<Class<?>> produces() { return Set.of(); }
                            @Override public void process(FlowContext ctx) {
                                throw new IllegalStateException("unknown error");
                            }
                        })
                .onStepError(ThreeWayError.INIT, RetriableException.class, ThreeWayError.RETRY)
                .onAnyError(ThreeWayError.FALLBACK)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        // IllegalStateException doesn't match RetriableException → falls back to FALLBACK
        assertEquals(ThreeWayError.FALLBACK, flow.currentState());
    }
}
