package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #114: requires/produces validation must terminate on
 * cyclic flows where a revisit brings a strict superset of the guaranteed set.
 *
 * Shape: START branches to two paths that join at B with partially overlapping data
 * (shrinking B's guaranteed set), and B <-> A form an external/auto cycle whose
 * transitions keep adding data. Before the fix, checkRequiresProducesFrom recursed
 * forever (StackOverflowError).
 */
class CyclicDataFlowTest {

    enum S implements FlowState {
        START(false, true), A0(false, false), C0(false, false),
        A(false, false), C(false, false), B(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record X(String v) {}
    record W(String v) {}
    record Y(String v) {}
    record Z(String v) {}

    static StateProcessor proc(String name, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {}
        };
    }

    static TransitionGuard guard(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new TransitionGuard() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) { return new GuardOutput.Accepted(Map.of()); }
        };
    }

    static final BranchProcessor ROUTE = new BranchProcessor() {
        @Override public String name() { return "route"; }
        @Override public Set<Class<?>> requires() { return Set.of(); }
        @Override public String decide(FlowContext ctx) { return "a"; }
    };

    private static FlowDefinition.Builder<S> cyclicFlow(Set<Class<?>> doneRequires) {
        return FlowDefinition.builder("cyclic-join", S.class)
                .from(S.START).branch(ROUTE).to(S.A0, "a").to(S.C0, "c").endBranch()
                .from(S.A0).auto(S.A, proc("initA", Set.of(X.class)))
                .from(S.C0).auto(S.C, proc("initC", Set.of(X.class, W.class)))
                .from(S.C).auto(S.B, proc("join", Set.of()))
                .from(S.A).auto(S.B, proc("toB", Set.of(Y.class)))
                .from(S.B).external(S.A, guard("backGuard", Set.of(), Set.of(Z.class)))
                .from(S.B).external(S.DONE, guard("doneGuard", doneRequires, Set.of()));
    }

    @Test void builds_when_guaranteed_set_stops_changing_on_revisit() {
        var def = cyclicFlow(Set.of(X.class)).build();
        assertEquals("cyclic-join", def.name());
        // Guaranteed set at B is the intersection of both incoming paths.
        assertEquals(Set.of(X.class), def.dataFlowGraph().availableAt(S.B));
    }

    @Test void still_reports_requires_that_only_one_join_path_satisfies() {
        var result = cyclicFlow(Set.of(Y.class)).buildAndValidate();
        assertNull(result.definition());
        assertTrue(result.errors().stream().anyMatch(e ->
                        e.message().contains("Guard 'doneGuard' at B requires Y but it may not be available")),
                "errors: " + result.errors());
    }
}
