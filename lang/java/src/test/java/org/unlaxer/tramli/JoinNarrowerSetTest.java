package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for issue #155: when a join state is revisited with a narrower
 * available set, the guaranteed set must shrink and downstream requires must be
 * re-checked, regardless of which incoming path is traversed first.
 */
class JoinNarrowerSetTest {

    enum S implements FlowState {
        A(false, true), B(false, false), J(false, false), DONE(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record P(String v) {}

    static StateProcessor proc(String name, Set<Class<?>> requires, Set<Class<?>> produces) {
        return new StateProcessor() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return requires; }
            @Override public Set<Class<?>> produces() { return produces; }
            @Override public void process(FlowContext ctx) {}
        };
    }

    static BranchProcessor branch() {
        return new BranchProcessor() {
            @Override public String name() { return "route"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public String decide(FlowContext ctx) { return "j"; }
        };
    }

    private static FlowDefinition.BuildResult<S> join(boolean richPathFirst) {
        var builder = FlowDefinition.builder("join", S.class).from(S.A).branch(branch());
        var branched = richPathFirst
                ? builder.to(S.B, "b").to(S.J, "j")
                : builder.to(S.J, "j").to(S.B, "b");
        return branched.endBranch()
                .from(S.B).auto(S.J, proc("makeP", Set.of(), Set.of(P.class)))
                .from(S.J).auto(S.DONE, proc("needsP", Set.of(P.class), Set.of()))
                .buildAndValidate();
    }

    @Test
    void rejectsWhenTheNarrowerPathArrivesSecond() {
        var result = join(true);
        assertNull(result.definition());
        assertTrue(result.errors().stream().anyMatch(e -> e.message().contains("Processor 'needsP' at J")),
                () -> "errors: " + result.errors());
    }

    @Test
    void rejectsWhenTheNarrowerPathArrivesFirst() {
        var result = join(false);
        assertNull(result.definition());
        assertTrue(result.errors().stream().anyMatch(e -> e.message().contains("Processor 'needsP' at J")),
                () -> "errors: " + result.errors());
    }
}
