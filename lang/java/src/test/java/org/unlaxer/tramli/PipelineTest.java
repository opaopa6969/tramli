package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class PipelineTest {

    record A(String v) {}
    record B(String v) {}
    record C(String v) {}

    static PipelineStep step(String name, Set<Class<?>> reqs, Set<Class<?>> prods,
                              java.util.function.Consumer<FlowContext> action) {
        return new PipelineStep() {
            @Override public String name() { return name; }
            @Override public Set<Class<?>> requires() { return reqs; }
            @Override public Set<Class<?>> produces() { return prods; }
            @Override public void process(FlowContext ctx) { action.accept(ctx); }
        };
    }

    // 1. Happy path
    @Test
    void happyPath() {
        var p = Tramli.pipeline("test")
                .initiallyAvailable(A.class)
                .step(step("s1", Set.of(A.class), Set.of(B.class), ctx -> ctx.put(B.class, new B("from-a"))))
                .step(step("s2", Set.of(B.class), Set.of(C.class), ctx -> ctx.put(C.class, new C("from-b"))))
                .build();

        var result = p.execute(Map.of(A.class, new A("input")));
        assertEquals("from-b", result.get(C.class).v());
    }

    // 2. requires 不足
    @Test
    void requiresNotMet_buildFails() {
        assertThrows(FlowException.class, () ->
                Tramli.pipeline("bad")
                        .step(step("s1", Set.of(A.class), Set.of(B.class), ctx -> {}))
                        .build());  // A not in initiallyAvailable
    }

    // 3. step 失敗
    @Test
    void stepFails_pipelineException() {
        var p = Tramli.pipeline("fail")
                .initiallyAvailable(A.class)
                .step(step("s1", Set.of(A.class), Set.of(B.class), ctx -> ctx.put(B.class, new B("ok"))))
                .step(step("s2", Set.of(B.class), Set.of(C.class), ctx -> { throw new RuntimeException("boom"); }))
                .build();

        var ex = assertThrows(PipelineException.class, () ->
                p.execute(Map.of(A.class, new A("x"))));
        assertEquals("s2", ex.failedStep());
        assertEquals(List.of("s1"), ex.completedSteps());
        assertNotNull(ex.context().find(B.class).orElse(null));
    }

    // 4. deadData
    @Test
    void deadData() {
        var p = Tramli.pipeline("dead")
                .initiallyAvailable(A.class)
                .step(step("s1", Set.of(A.class), Set.of(B.class, C.class), ctx -> {
                    ctx.put(B.class, new B("b"));
                    ctx.put(C.class, new C("c"));
                }))
                .step(step("s2", Set.of(B.class), Set.of(), ctx -> {}))
                .build();

        // C is produced but never required → dead
        assertTrue(p.dataFlow().deadData().contains(C.class));
    }

    // 5. Mermaid
    @Test
    void mermaid() {
        var p = Tramli.pipeline("mmd")
                .initiallyAvailable(A.class)
                .step(step("parse", Set.of(A.class), Set.of(B.class), ctx -> ctx.put(B.class, new B(""))))
                .build();

        String mmd = p.dataFlow().toMermaid();
        assertTrue(mmd.contains("flowchart LR"));
        assertTrue(mmd.contains("parse"));
        assertTrue(mmd.contains("produces"));
    }

    // 6. 空パイプライン
    @Test
    void emptyPipeline() {
        var p = Tramli.pipeline("empty").build();
        var result = p.execute(Map.of());
        assertNotNull(result);
    }

    // 7. strictMode
    @Test
    void strictMode_producesViolation() {
        var p = Tramli.pipeline("strict")
                .initiallyAvailable(A.class)
                .step(step("bad", Set.of(A.class), Set.of(B.class), ctx -> { /* doesn't put B */ }))
                .build();
        p.setStrictMode(true);

        var ex = assertThrows(PipelineException.class, () ->
                p.execute(Map.of(A.class, new A("x"))));
        assertEquals("bad", ex.failedStep());
    }

    // 8. asStep
    @Test
    void asStep() {
        var inner = Tramli.pipeline("inner")
                .initiallyAvailable(A.class)
                .step(step("s1", Set.of(A.class), Set.of(B.class), ctx -> ctx.put(B.class, new B("nested"))))
                .build();

        var outer = Tramli.pipeline("outer")
                .initiallyAvailable(A.class)
                .step(inner.asStep())
                .step(step("s2", Set.of(B.class), Set.of(C.class), ctx -> ctx.put(C.class, new C("final"))))
                .build();

        var result = outer.execute(Map.of(A.class, new A("start")));
        assertEquals("final", result.get(C.class).v());
    }

    // 9. StateLogger
    @Test
    void stateLogger() {
        var logged = new ArrayList<String>();
        var p = Tramli.pipeline("log")
                .initiallyAvailable(A.class)
                .step(step("s1", Set.of(A.class), Set.of(B.class), ctx -> ctx.put(B.class, new B("v"))))
                .build();
        p.setStateLogger(entry -> logged.add(entry.typeName()));

        p.execute(Map.of(A.class, new A("x")));
        assertTrue(logged.contains("B"));
    }
}
