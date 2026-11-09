package org.unlaxer.tramli;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class SubFlowExternalProcessorTest {
    enum S implements FlowState {
        WAIT, NEXT, DONE, TYPED_ERROR, ERROR;

        public boolean isInitial() { return this == WAIT; }
        public boolean isTerminal() { return this == DONE || this == TYPED_ERROR || this == ERROR; }
    }

    record Input(String value) {}
    record Produced(int value) {}
    record Accepted(String value) {}

    private TransitionGuard guard(boolean guarded) {
        return !guarded ? null : new TransitionGuard() {
            public String name() { return "accept"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(Accepted.class); }
            public int maxRetries() { return 3; }
            public GuardOutput validate(FlowContext ctx) {
                return new GuardOutput.Accepted(Map.of(Accepted.class, new Accepted("accepted")));
            }
        };
    }

    private FlowDefinition<S> parent(FlowDefinition<S> child) {
        return FlowDefinition.builder("parent", S.class).allowUnreachable()
                .from(S.WAIT).subFlow(child)
                .onExit("DONE", S.DONE).onExit("TYPED_ERROR", S.TYPED_ERROR)
                .onExit("ERROR", S.ERROR).endSubFlow().onError(S.WAIT, S.ERROR).build();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void runsProcessorBeforeDownstreamConsumer(boolean guarded) {
        var calls = new AtomicInteger();
        var consumed = new AtomicInteger();
        StateProcessor producer = new StateProcessor() {
            public String name() { return "produce"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(Produced.class); }
            public void process(FlowContext ctx) {
                calls.incrementAndGet();
                assertEquals(guarded, ctx.has(Accepted.class));
                ctx.put(Produced.class, new Produced(42));
            }
        };
        StateProcessor consumer = new StateProcessor() {
            public String name() { return "consume"; }
            public Set<Class<?>> requires() { return Set.of(Produced.class); }
            public Set<Class<?>> produces() { return Set.of(); }
            public void process(FlowContext ctx) { consumed.set(ctx.get(Produced.class).value()); }
        };
        var child = FlowDefinition.builder("child-success", S.class)
                .allowUnreachable()
                .from(S.WAIT).external(S.NEXT, guard(guarded), producer)
                .from(S.NEXT).auto(S.DONE, consumer)
                .build();
        var def = parent(child);
        var engine = new FlowEngine(new InMemoryFlowStore());
        var logs = new java.util.ArrayList<LogEntry.State>();
        engine.setStateLogger(logs::add);
        var flow = engine.startFlow(def, "session", Map.of());
        assertEquals(S.WAIT, flow.currentState());
        assertEquals(0, calls.get());

        var resumed = engine.resumeAndExecute(flow.id(), def);

        assertEquals(1, calls.get());
        assertEquals(42, consumed.get());
        assertEquals(1, logs.stream().filter(e -> e.type() == Produced.class).count());
        assertEquals(new Produced(42), resumed.context().get(Produced.class));
        assertEquals(S.DONE, resumed.currentState());
        assertTrue(resumed.isCompleted());
        assertNull(resumed.lastError());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void failureRestoresContextAndUsesOnStepError(boolean guarded) {
        assertFailureRoute(new IllegalArgumentException("processor failed"), S.TYPED_ERROR, guarded);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void unmatchedFailureRestoresContextAndFallsBackToOnError(boolean guarded) {
        assertFailureRoute(new IllegalStateException("processor failed"), S.ERROR, guarded);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void unhandledFailureBubblesToParent(boolean guarded) {
        StateProcessor producer = new StateProcessor() {
            public String name() { return "fail"; }
            public Set<Class<?>> requires() { return Set.of(); }
            public Set<Class<?>> produces() { return Set.of(); }
            public void process(FlowContext ctx) {
                ctx.put(Produced.class, new Produced(42));
                throw new IllegalStateException("processor failed");
            }
        };
        var child = FlowDefinition.builder("unhandled", S.class).allowUnreachable()
                .from(S.WAIT).external(S.DONE, guard(guarded), producer).build();
        var def = parent(child);
        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(def, "session", Map.of());
        engine.resumeAndExecute(flow.id(), def);
        assertEquals(S.ERROR, flow.currentState());
        assertTrue(flow.isCompleted());
        assertNull(flow.activeSubFlow());
        assertTrue(flow.context().snapshot().isEmpty());
    }

    private void assertFailureRoute(RuntimeException failure, S target, boolean guarded) {
        var calls = new AtomicInteger();
        StateProcessor producer = new StateProcessor() {
            public String name() { return "failAfterWrites"; }
            public Set<Class<?>> requires() { return Set.of(Input.class); }
            public Set<Class<?>> produces() { return Set.of(Produced.class); }
            public void process(FlowContext ctx) {
                calls.incrementAndGet();
                assertEquals(guarded, ctx.has(Accepted.class));
                assertEquals(new Input("external"), ctx.get(Input.class));
                ctx.put(Input.class, new Input("dirty"));
                ctx.put(Produced.class, new Produced(42));
                throw failure;
            }
        };
        var child = FlowDefinition.builder("child-failure", S.class)
                .allowUnreachable()
                .initiallyAvailable(Input.class)
                .from(S.WAIT).external(S.DONE, guard(guarded), producer)
                .onStepError(S.WAIT, IllegalArgumentException.class, S.TYPED_ERROR)
                .onError(S.WAIT, S.ERROR)
                .build();
        var store = new InMemoryFlowStore();
        var def = parent(child);
        var engine = new FlowEngine(store);
        var flow = engine.startFlow(def, "session", Map.of(Input.class, new Input("initial")));

        var childFlow = flow.activeSubFlow();
        var resumed = engine.resumeAndExecute(flow.id(), def,
                Map.of(Input.class, new Input("external"), String.class, "event"));

        assertEquals(1, calls.get());
        assertEquals(target, resumed.currentState());
        assertTrue(resumed.isCompleted());
        assertEquals(Map.of(Input.class, new Input("external"), String.class, "event"),
                resumed.context().snapshot());
        assertTrue(childFlow.lastError().contains("processor failed"));
        assertEquals(target, childFlow.currentState());
        assertNull(resumed.activeSubFlow());
        assertTrue(store.transitionLog().stream().noneMatch(t -> t.to().equals("DONE")));
        assertEquals(target, store.load(flow.id()).orElseThrow().currentState());
    }
}
