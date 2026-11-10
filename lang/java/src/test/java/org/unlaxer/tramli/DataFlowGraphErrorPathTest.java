package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #170: DataFlowGraph follows error routes like the
 * build() requires/produces check (issues #152 and #157). A step leaving a
 * non-terminal state can fail, the engine restores the context, and every
 * onStepError / onError target receives exactly the guaranteed set of that state.
 */
class DataFlowGraphErrorPathTest {

    enum S implements FlowState {
        A(false, true), B(false, false), E(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record I(String v) {}
    record P(String v) {}
    record G(String v) {}

    static StateProcessor proc(String name, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {}
        };
    }

    static final TransitionGuard GUARD = new TransitionGuard() {
        @Override public String name() { return "guard"; }
        @Override public Set<Class<?>> requires() { return Set.of(); }
        @Override public Set<Class<?>> produces() { return Set.of(G.class); }
        @Override public int maxRetries() { return 3; }
        @Override public GuardOutput validate(FlowContext ctx) { return new GuardOutput.Accepted(); }
    };

    @ParameterizedTest(name = "exception route: {0}")
    @ValueSource(booleans = {false, true})
    void intersectsAJoinReachedByAnErrorRoute(boolean exceptionRoute) {
        // A -> E produces P; the error route A -> E carries only A's guaranteed set.
        var builder = FlowDefinition.builder("error-join", S.class)
                .allowUnreachable() // B is not used
                .from(S.A).auto(S.E, proc("makeP", Set.of(P.class)))
                .from(S.E).auto(S.DONE, proc("finish", Set.of()));
        if (exceptionRoute) builder.onStepError(S.A, RuntimeException.class, S.E);
        else builder.onError(S.A, S.E);
        var graph = builder.build().dataFlowGraph();
        assertEquals(Set.of(), graph.availableAt(S.E));
        assertEquals(Set.of(), graph.availableAt(S.DONE));
    }

    @Test
    void tracksAStateReachedOnlyThroughAnExceptionRoute() {
        var graph = FlowDefinition.builder("step-error-reach", S.class)
                .allowUnreachable() // B is not used
                .initiallyAvailable(I.class)
                .from(S.A).auto(S.DONE, proc("work", Set.of(P.class)))
                .from(S.E).auto(S.DONE, proc("recover", Set.of()))
                .onStepError(S.A, RuntimeException.class, S.E)
                .build().dataFlowGraph();
        assertEquals(Set.of(I.class), graph.availableAt(S.E));
        assertTrue(graph.generateInvariantAssertions().contains("At state E: context must contain [I]"),
                () -> "assertions: " + graph.generateInvariantAssertions());
    }

    @Test
    void doesNotCarryGuardProducesOntoTheErrorPath() {
        var graph = FlowDefinition.builder("guard-error", S.class)
                .initiallyAvailable(I.class)
                .from(S.A).external(S.B, GUARD, proc("step", Set.of()))
                .from(S.B).auto(S.DONE, proc("fine", Set.of()))
                .from(S.E).auto(S.DONE, proc("recover", Set.of()))
                .onError(S.A, S.E)
                .build().dataFlowGraph();
        assertEquals(Set.of(I.class, G.class), graph.availableAt(S.B));
        assertEquals(Set.of(I.class), graph.availableAt(S.E));
    }
}
