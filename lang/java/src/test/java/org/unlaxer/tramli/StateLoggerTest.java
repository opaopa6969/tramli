package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class StateLoggerTest {
    enum S implements FlowState {
        INIT, DONE, ERROR;
        public boolean isInitial() { return this == INIT; }
        public boolean isTerminal() { return this != INIT; }
    }
    record Existing(String value) {}
    record Added(String value) {}
    record Unchanged(String value) {}

    FlowDefinition<S> definition(String mode, boolean fail) {
        StateProcessor processor = new StateProcessor() {
            public String name() { return "Put"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(); }
            public void process(FlowContext ctx) {
                ctx.put(Existing.class, new Existing("intermediate"));
                ctx.put(Existing.class, new Existing("final"));
                ctx.put(Added.class, new Added("new"));
                ctx.put(Unchanged.class, ctx.get(Unchanged.class));
                if (fail) throw new IllegalStateException("failed");
            }
        };
        var b = Tramli.define("state-logger", S.class).onAnyError(S.ERROR)
                .onStateExit(S.INIT, ctx -> ctx.put(Double.class, 1.0))
                .onStateEnter(S.DONE, ctx -> ctx.put(Double.class, 2.0));
        if (mode.equals("auto")) b.from(S.INIT).auto(S.DONE, processor);
        else if (mode.equals("branch")) b.from(S.INIT).branch(new BranchProcessor() {
            public String name() { return "Choose"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public String decide(FlowContext ctx) { return "run"; }
        }).to(S.DONE, "skip").to(S.DONE, "run", processor).endBranch();
        else b.from(S.INIT).external(S.DONE, new TransitionGuard() {
            public String name() { return "Accept"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(Long.class); }
            public int maxRetries() { return 3; }
            public GuardOutput validate(FlowContext ctx) { return new GuardOutput.Accepted(Map.of(Long.class, 5L)); }
        }, processor);
        return b.build();
    }

    @Test void successful_processors_log_final_added_and_replaced_values() {
        for (String mode : new String[]{"auto", "branch", "external"}) {
            var engine = new FlowEngine(new InMemoryFlowStore());
            var entries = new ArrayList<LogEntry.State>();
            engine.setStateLogger(entries::add);
            var def = definition(mode, false);
            var flow = engine.startFlow(def, "test", Map.of(Existing.class, new Existing("original"),
                    Unchanged.class, new Unchanged("same")));
            if (mode.equals("external")) {
                assertTrue(entries.isEmpty());
                flow = engine.resumeAndExecute(flow.id(), def);
            }
            assertEquals(S.DONE, flow.currentState());
            assertEquals(2, entries.size(), mode);
            for (var entry : entries) {
                assertEquals(flow.id(), entry.flowId());
                assertEquals("state-logger", entry.flowName());
                assertEquals("INIT", entry.state());
            }
            assertTrue(entries.stream().anyMatch(e -> e.type() == Existing.class && e.value().equals(new Existing("final"))));
            assertTrue(entries.stream().anyMatch(e -> e.type() == Added.class && e.value().equals(new Added("new"))));
        }
    }

    @Test void failed_processors_restore_without_logging() {
        for (String mode : new String[]{"auto", "branch", "external"}) {
            var engine = new FlowEngine(new InMemoryFlowStore());
            var entries = new ArrayList<LogEntry.State>();
            engine.setStateLogger(entries::add);
            var def = definition(mode, true);
            var flow = engine.startFlow(def, "test", Map.of(Existing.class, new Existing("original"),
                    Unchanged.class, new Unchanged("same")));
            if (mode.equals("external")) flow = engine.resumeAndExecute(flow.id(), def);
            assertEquals(S.ERROR, flow.currentState());
            assertTrue(entries.isEmpty(), mode);
            assertEquals(new Existing("original"), flow.context().get(Existing.class));
            assertFalse(flow.context().has(Added.class));
        }
    }

    @Test void removed_logger_is_not_called() {
        var engine = new FlowEngine(new InMemoryFlowStore());
        engine.setStateLogger(e -> fail("logger removed"));
        engine.removeAllLoggers();
        var flow = engine.startFlow(definition("auto", false), "test",
                Map.of(Unchanged.class, new Unchanged("same")));
        assertEquals(S.DONE, flow.currentState());
        assertEquals(new Added("new"), flow.context().get(Added.class));
    }

    @Test void produces_violation_does_not_log() {
        var engine = new FlowEngine(new InMemoryFlowStore(), true);
        var entries = new ArrayList<LogEntry.State>();
        engine.setStateLogger(entries::add);
        var def = Tramli.define("strict-logger", S.class)
                .from(S.INIT).auto(S.DONE, new StateProcessor() {
                    public String name() { return "MissingOutput"; }
                    public Set<Class<?>> requires() { return Set.of(); }
                    public Set<Class<?>> produces() { return Set.of(Added.class); }
                    public void process(FlowContext ctx) { ctx.put(Existing.class, new Existing("dirty")); }
                }).onAnyError(S.ERROR).build();
        var flow = engine.startFlow(def, "test", Map.of());
        assertEquals(S.ERROR, flow.currentState());
        assertTrue(entries.isEmpty());
        assertFalse(flow.context().has(Existing.class));
    }
}
