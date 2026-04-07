package com.tramli;

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
}
