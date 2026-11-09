package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #157: any step leaving a state can fail (processor or
 * branch exception, guard retries exhausted), and the engine restores the context to
 * what it was before the guard ran. Error targets must therefore be checked with
 * exactly the guaranteed set of the failing state.
 */
class ErrorPathDataFlowTest {

    enum S implements FlowState {
        A(false, true), B(false, false), E(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record P(String v) {}
    record G(String v) {}

    static StateProcessor proc(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {}
        };
    }

    static final BranchProcessor ROUTE = new BranchProcessor() {
        @Override public String name() { return "route"; }
        @Override public Set<Class<?>> requires() { return Set.of(); }
        @Override public String decide(FlowContext ctx) { return "b"; }
    };

    static final TransitionGuard GUARD = new TransitionGuard() {
        @Override public String name() { return "guard"; }
        @Override public Set<Class<?>> requires() { return Set.of(); }
        @Override public Set<Class<?>> produces() { return Set.of(G.class); }
        @Override public int maxRetries() { return 3; }
        @Override public GuardOutput validate(FlowContext ctx) {
            return new GuardOutput.Accepted(Map.of(G.class, new G("g")));
        }
    };

    private static void assertRejectedAtE(FlowDefinition.BuildResult<S> result, String processor) {
        assertNull(result.definition());
        assertTrue(result.errors().stream().anyMatch(e -> e.message().contains("Processor '" + processor + "' at E")),
                () -> "errors: " + result.errors());
    }

    @Test
    void checksTheErrorTargetOfAStateWithOnlyABranch() {
        var result = FlowDefinition.builder("branch-error", S.class)
                .from(S.A).branch(ROUTE).to(S.B, "b").to(S.DONE, "d").endBranch()
                .from(S.B).auto(S.DONE, proc("fine", Set.of(), Set.of()))
                .from(S.E).auto(S.DONE, proc("needsP", Set.of(P.class), Set.of()))
                .onError(S.A, S.E)
                .buildAndValidate();
        assertRejectedAtE(result, "needsP");
    }

    @Test
    void guardProducesAreNotAvailableOnTheErrorPath() {
        var result = FlowDefinition.builder("guard-error", S.class)
                .from(S.A).external(S.B, GUARD, proc("step", Set.of(), Set.of()))
                .from(S.B).auto(S.DONE, proc("fine", Set.of(), Set.of()))
                .from(S.E).auto(S.DONE, proc("needsG", Set.of(G.class), Set.of()))
                .onError(S.A, S.E)
                .buildAndValidate();
        assertRejectedAtE(result, "needsG");
    }
}
