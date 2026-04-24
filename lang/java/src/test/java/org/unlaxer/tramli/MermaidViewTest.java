package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Issue #47: unified view option for MermaidGenerator.
 */
final class MermaidViewTest {

    enum S implements FlowState {
        A(false, true),
        B(false, false),
        C(true, false);

        private final boolean terminal, initial;
        S(boolean terminal, boolean initial) { this.terminal = terminal; this.initial = initial; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    static final StateProcessor P1 = new StateProcessor() {
        @Override public String name() { return "p1"; }
        @Override public Set<Class<?>> requires() { return Set.of(); }
        @Override public Set<Class<?>> produces() { return Set.of(Integer.class); }
        @Override public void process(FlowContext ctx) { ctx.put(Integer.class, 1); }
    };

    static final StateProcessor P2 = new StateProcessor() {
        @Override public String name() { return "p2"; }
        @Override public Set<Class<?>> requires() { return Set.of(Integer.class); }
        @Override public Set<Class<?>> produces() { return Set.of(String.class); }
        @Override public void process(FlowContext ctx) { ctx.put(String.class, "n=" + ctx.get(Integer.class)); }
    };

    private static FlowDefinition<S> buildFlow() {
        return Tramli.<S>define("view-test", S.class)
                .from(S.A).auto(S.B, P1)
                .from(S.B).auto(S.C, P2)
                .build();
    }

    @Test void defaultViewIsState() {
        var def = buildFlow();
        String out = MermaidGenerator.generate(def);
        assertTrue(out.contains("stateDiagram-v2"));
        assertTrue(out.contains("A --> B"));
    }

    @Test void viewStateEqualsDefault() {
        var def = buildFlow();
        assertEquals(
                MermaidGenerator.generate(def),
                MermaidGenerator.generate(def, MermaidGenerator.View.STATE));
    }

    @Test void viewDataflowProducesFlowchart() {
        var def = buildFlow();
        String out = MermaidGenerator.generate(def, MermaidGenerator.View.DATAFLOW);
        assertTrue(out.contains("flowchart LR"), out);
        assertTrue(out.contains("p1"), out);
        assertTrue(out.contains("Integer"), out);
        assertTrue(out.contains("produces"), out);
        assertTrue(out.contains("requires"), out);
        assertFalse(out.contains("stateDiagram"), out);
    }

    @Test void viewDataflowEqualsGenerateDataFlow() {
        var def = buildFlow();
        assertEquals(
                MermaidGenerator.generateDataFlow(def),
                MermaidGenerator.generate(def, MermaidGenerator.View.DATAFLOW));
    }
}
