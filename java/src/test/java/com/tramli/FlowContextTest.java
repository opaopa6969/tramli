package com.tramli;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FlowContextTest {

    record Alpha(String value) {}
    record Beta(int count) {}

    @Test
    void putAndGet() {
        var ctx = new FlowContext("f1");
        ctx.put(Alpha.class, new Alpha("hello"));
        assertEquals("hello", ctx.get(Alpha.class).value());
    }

    @Test
    void getMissingThrows() {
        var ctx = new FlowContext("f1");
        var ex = assertThrows(FlowException.class, () -> ctx.get(Alpha.class));
        assertEquals("MISSING_CONTEXT", ex.code());
    }

    @Test
    void findReturnsOptional() {
        var ctx = new FlowContext("f1");
        assertTrue(ctx.find(Alpha.class).isEmpty());
        ctx.put(Alpha.class, new Alpha("x"));
        assertTrue(ctx.find(Alpha.class).isPresent());
    }

    @Test
    void snapshotIsUnmodifiable() {
        var ctx = new FlowContext("f1");
        ctx.put(Alpha.class, new Alpha("x"));
        assertThrows(UnsupportedOperationException.class,
                () -> ctx.snapshot().put(Beta.class, new Beta(1)));
    }
}
