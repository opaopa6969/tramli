package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #170: DataFlowGraph must compute the same guaranteed
 * sets as the build() requires/produces check. When a join state is revisited with
 * a narrower available set, availableAt() must shrink, regardless of which incoming
 * path is traversed first, and traversal must still stop on cyclic flows.
 */
class DataFlowGraphJoinTest {

    enum S implements FlowState {
        A(false, true), B(false, false), J(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record P(String v) {}
    record Q(String v) {}
    record Direct() {}
    record Detour() {}
    record Return() {}
    record Finish() {}
    record ToB() {}
    record ToJ() {}
    record FromB() {}
    record Again() {}

    static StateProcessor proc(String name, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {}
        };
    }

    static TransitionGuard guard(String name, Set<Class<?>> produces) {
        return new TransitionGuard() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public int maxRetries() { return 1; }
            @Override public GuardOutput validate(FlowContext ctx) { return new GuardOutput.Accepted(); }
        };
    }

    static BranchProcessor route() {
        return new BranchProcessor() {
            @Override public String name() { return "route"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public String decide(FlowContext ctx) { return "j"; }
        };
    }

    private static DataFlowGraph<S> branchJoin(boolean richPathFirst) {
        var builder = FlowDefinition.builder("join", S.class).from(S.A).branch(route());
        var branched = richPathFirst
                ? builder.to(S.B, "b").to(S.J, "j")
                : builder.to(S.J, "j").to(S.B, "b");
        return branched.endBranch()
                .from(S.B).auto(S.J, proc("makeP", Set.of(P.class)))
                .from(S.J).auto(S.DONE, proc("finish", Set.of()))
                .build().dataFlowGraph();
    }

    private static DataFlowGraph<S> externalJoin(boolean richPathFirst) {
        // Issue reproduction: A -> J produces P, A -> B -> J does not.
        var builder = FlowDefinition.builder("external-join", S.class);
        if (richPathFirst) {
            builder.from(S.A).externalOn(Direct.class, S.J, guard("direct", Set.of(P.class)));
            builder.from(S.A).externalOn(Detour.class, S.B, guard("detour", Set.of()));
        } else {
            builder.from(S.A).externalOn(Detour.class, S.B, guard("detour", Set.of()));
            builder.from(S.A).externalOn(Direct.class, S.J, guard("direct", Set.of(P.class)));
        }
        return builder
                .from(S.B).externalOn(Return.class, S.J, guard("return", Set.of()))
                .from(S.J).externalOn(Finish.class, S.DONE, guard("finish", Set.of()))
                .build().dataFlowGraph();
    }

    @ParameterizedTest(name = "rich path first: {0}")
    @ValueSource(booleans = {true, false})
    void shrinksAvailableAtAtABranchJoin(boolean richPathFirst) {
        var graph = branchJoin(richPathFirst);
        assertEquals(Set.of(), graph.availableAt(S.B));
        assertEquals(Set.of(), graph.availableAt(S.J));
        assertEquals(Set.of(), graph.availableAt(S.DONE));
    }

    @ParameterizedTest(name = "rich path first: {0}")
    @ValueSource(booleans = {true, false})
    void shrinksAvailableAtAtAnExternalJoin(boolean richPathFirst) {
        var graph = externalJoin(richPathFirst);
        assertEquals(Set.of(), graph.availableAt(S.J));
        assertEquals(Set.of(), graph.availableAt(S.DONE));
    }

    @Test
    void stopsOnAProducesSelfLoopAndStillShrinksTheJoin() {
        // A -> B -> J carries P, A -> J carries nothing, and J loops on itself adding Q.
        var graph = FlowDefinition.builder("loop-join", S.class)
                .from(S.A).externalOn(ToB.class, S.B, guard("toB", Set.of(P.class)))
                .from(S.A).externalOn(ToJ.class, S.J, guard("toJ", Set.of()))
                .from(S.B).externalOn(FromB.class, S.J, guard("fromB", Set.of()))
                .from(S.J).externalOn(Again.class, S.J, guard("again", Set.of(Q.class)))
                .from(S.J).externalOn(Finish.class, S.DONE, guard("finish", Set.of()))
                .build().dataFlowGraph();
        assertEquals(Set.of(P.class), graph.availableAt(S.B));
        assertEquals(Set.of(), graph.availableAt(S.J));
        assertEquals(Set.of(), graph.availableAt(S.DONE));
    }
}
