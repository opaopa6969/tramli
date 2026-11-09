package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class UnguardedExternalProcessorTest {
    enum S implements FlowState {
        WAIT, NEXT, DONE, TYPED_ERROR, ERROR;

        public boolean isInitial() { return this == WAIT; }
        public boolean isTerminal() { return this == DONE || this == TYPED_ERROR || this == ERROR; }
    }

    record Input(String value) {}
    record Produced(int value) {}

    @Test
    void runsProcessorBeforeDownstreamConsumer() {
        var calls = new AtomicInteger();
        var consumed = new AtomicInteger();
        StateProcessor producer = new StateProcessor() {
            public String name() { return "produce"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(Produced.class); }
            public void process(FlowContext ctx) {
                calls.incrementAndGet();
                ctx.put(Produced.class, new Produced(42));
            }
        };
        StateProcessor consumer = new StateProcessor() {
            public String name() { return "consume"; }
            public Set<Class<?>> requires() { return Set.of(Produced.class); }
            public Set<Class<?>> produces() { return Set.of(); }
            public void process(FlowContext ctx) { consumed.set(ctx.get(Produced.class).value()); }
        };
        var def = FlowDefinition.builder("unguarded-success", S.class)
                .allowUnreachable()
                .from(S.WAIT).external(S.NEXT, null, producer)
                .from(S.NEXT).auto(S.DONE, consumer)
                .build();
        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, "session", Map.of());
        assertEquals(S.WAIT, flow.currentState());
        assertEquals(0, calls.get());

        var resumed = engine.resumeAndExecute(flow.id(), def);

        assertEquals(1, calls.get());
        assertEquals(42, consumed.get());
        assertEquals(new Produced(42), resumed.context().get(Produced.class));
        assertEquals(S.DONE, resumed.currentState());
        assertTrue(resumed.isCompleted());
        assertNull(resumed.lastError());
    }

    @Test
    void failureRestoresContextAndUsesOnStepError() {
        assertFailureRoute(new IllegalArgumentException("processor failed"), S.TYPED_ERROR);
    }

    @Test
    void unmatchedFailureRestoresContextAndFallsBackToOnError() {
        assertFailureRoute(new IllegalStateException("processor failed"), S.ERROR);
    }

    private void assertFailureRoute(RuntimeException failure, S target) {
        var calls = new AtomicInteger();
        StateProcessor producer = new StateProcessor() {
            public String name() { return "failAfterWrites"; }
            public Set<Class<?>> requires() { return Set.of(Input.class); }
            public Set<Class<?>> produces() { return Set.of(Produced.class); }
            public void process(FlowContext ctx) {
                calls.incrementAndGet();
                assertEquals(new Input("external"), ctx.get(Input.class));
                ctx.put(Input.class, new Input("dirty"));
                ctx.put(Produced.class, new Produced(42));
                throw failure;
            }
        };
        var def = FlowDefinition.builder("unguarded-failure", S.class)
                .allowUnreachable()
                .initiallyAvailable(Input.class)
                .from(S.WAIT).external(S.DONE, null, producer)
                .onStepError(S.WAIT, IllegalArgumentException.class, S.TYPED_ERROR)
                .onError(S.WAIT, S.ERROR)
                .build();
        var store = new InMemoryFlowStore();
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "session", Map.of(Input.class, new Input("initial")));

        var resumed = engine.resumeAndExecute(flow.id(), def,
                Map.of(Input.class, new Input("external"), String.class, "event"));

        assertEquals(1, calls.get());
        assertEquals(target, resumed.currentState());
        assertTrue(resumed.isCompleted());
        assertEquals(Map.of(Input.class, new Input("external"), String.class, "event"),
                resumed.context().snapshot());
        assertTrue(resumed.lastError().contains("processor failed"));
        assertTrue(store.transitionLog().stream().noneMatch(t -> t.to().equals("DONE")));
        assertEquals(target, store.load(flow.id()).orElseThrow().currentState());
    }
}
