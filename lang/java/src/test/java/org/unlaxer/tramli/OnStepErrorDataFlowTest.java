package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #152: onStepError routes must be traversed by the
 * reachability, path-to-terminal and requires/produces checks, exactly like the
 * onError fallback (guard produces available, processor produces not).
 */
class OnStepErrorDataFlowTest {

    enum S implements FlowState {
        A(false, true), B(false, false), X(false, false), RECOVER(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record P(String v) {}

    static class Boom extends RuntimeException {}

    static StateProcessor proc(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {
                if (produces.contains(P.class)) ctx.put(P.class, new P("p"));
            }
        };
    }

    @Test
    void rejectsRequiresThatTheExceptionPathCannotSatisfy() {
        // Normal path A -> B -> X carries P, but a failure at A routes straight to X without P.
        var result = FlowDefinition.builder("ex-route", S.class)
                .from(S.A).auto(S.B, proc("makeP", Set.of(), Set.of(P.class)))
                .from(S.B).auto(S.X, proc("toX", Set.of(), Set.of()))
                .from(S.X).auto(S.DONE, proc("needsP", Set.of(P.class), Set.of()))
                .from(S.RECOVER).auto(S.DONE, proc("unused", Set.of(), Set.of()))
                .onStepError(S.A, Boom.class, S.X)
                .onStepError(S.B, Boom.class, S.RECOVER)
                .buildAndValidate();
        assertNull(result.definition());
        assertTrue(result.errors().stream().anyMatch(e ->
                        e.code().equals("MISSING_REQUIRES") && e.message().contains("Processor 'needsP' at X")),
                () -> "errors: " + result.errors());
    }

    @Test
    void stateReachableOnlyThroughAnExceptionRouteIsReachable() {
        var def = FlowDefinition.builder("ex-only", S.class)
                .from(S.A).auto(S.B, proc("step", Set.of(), Set.of()))
                .from(S.B).auto(S.X, proc("toX", Set.of(), Set.of()))
                .from(S.X).auto(S.DONE, proc("finish", Set.of(), Set.of()))
                .from(S.RECOVER).auto(S.DONE, proc("recover", Set.of(), Set.of()))
                .onStepError(S.A, Boom.class, S.RECOVER)
                .build();
        assertNotNull(def);
    }

    @Test
    void dataAvailableBeforeTheFailingStepReachesTheExceptionRoute() {
        var result = FlowDefinition.builder("ex-route-ok", S.class)
                .initiallyAvailable(P.class)
                .from(S.A).auto(S.B, proc("step", Set.of(), Set.of()))
                .from(S.B).auto(S.X, proc("toX", Set.of(), Set.of()))
                .from(S.X).auto(S.DONE, proc("needsP", Set.of(P.class), Set.of()))
                .from(S.RECOVER).auto(S.DONE, proc("recover", Set.of(P.class), Set.of()))
                .onStepError(S.A, Boom.class, S.RECOVER)
                .buildAndValidate();
        assertNotNull(result.definition(), () -> "errors: " + result.errors());
    }
}
