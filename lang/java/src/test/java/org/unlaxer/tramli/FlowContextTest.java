package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FlowContextTest {

    record Alpha(String value) {}
    record Beta(int count) {}

    @Test
    void aliasOfReturnsRegisteredAlias() {
        var ctx = new FlowContext("f1");
        ctx.registerAlias(Alpha.class, "alpha");
        assertEquals("alpha", ctx.aliasOf(Alpha.class));
    }

    @Test
    void keyOfAliasReturnsRegisteredType() {
        var ctx = new FlowContext("f1");
        ctx.registerAlias(Alpha.class, "alpha");
        assertSame(Alpha.class, ctx.keyOfAlias("alpha"));
    }

    @Test
    void unregisteredAliasLookupsReturnNull() {
        var ctx = new FlowContext("f1");
        ctx.put(Alpha.class, new Alpha("hello"));
        ctx.registerAlias(Beta.class, "beta");
        assertNull(ctx.aliasOf(Alpha.class));
        assertNull(ctx.keyOfAlias("Alpha"));
        assertNull(ctx.keyOfAlias("unknown"));
    }

    @Test
    void aliasLookupsRoundTripForMultipleTypes() {
        var ctx = new FlowContext("f1");
        ctx.registerAlias(Alpha.class, "alpha");
        ctx.registerAlias(Beta.class, "beta");
        for (Class<?> type : new Class<?>[] {Alpha.class, Beta.class}) {
            assertSame(type, ctx.keyOfAlias(ctx.aliasOf(type)));
        }
        for (String alias : new String[] {"alpha", "beta"}) {
            assertEquals(alias, ctx.aliasOf(ctx.keyOfAlias(alias)));
        }
    }

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
