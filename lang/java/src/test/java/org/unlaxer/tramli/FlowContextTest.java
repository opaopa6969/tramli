package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

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
    @Test
    void aliasesRoundTripAndCopiesAreIndependent() {
        var source = new FlowContext("source");
        source.registerAlias(Alpha.class, "alpha");
        source.registerAlias(Beta.class, "beta");
        var aliases = source.exportAliases();
        assertEquals(Map.of("alpha", Alpha.class, "beta", Beta.class), aliases);
        var target = new FlowContext("target");
        target.importAliases(aliases);
        aliases.clear();
        assertEquals(source.exportAliases(), target.exportAliases());
        assertEquals("alpha", target.aliasOf(Alpha.class));
        assertSame(Beta.class, target.keyOfAlias("beta"));
        assertTrue(target.snapshot().isEmpty());
        target.importAliases(Map.of("renamed", Alpha.class));
        source.registerAlias(Alpha.class, "renamed");
        assertEquals(source.exportAliases(), target.exportAliases());
        assertEquals(source.aliasOf(Alpha.class), target.aliasOf(Alpha.class));
    }

    // shared-tests/scenarios/alias-data-round-trip.yaml
    @Test
    void alias_data_round_trip() {
        var source = new FlowContext("source");
        source.registerAlias(Alpha.class, "alpha");
        source.registerAlias(Beta.class, "beta");
        source.put(Alpha.class, new Alpha("hello"));
        source.put(Beta.class, new Beta(7));
        var data = source.toAliasedData();
        assertEquals(Map.of("alpha", new Alpha("hello"), "beta", new Beta(7)), data);
        data.put("unknown", new Alpha("ignored"));
        var target = new FlowContext("target");
        target.importAliases(source.exportAliases());
        target.put(Alpha.class, new Alpha("old"));
        target.fromAliasedData(data);
        assertEquals(source.snapshot(), target.snapshot());
        data.clear();
        assertEquals(2, source.toAliasedData().size());
        assertEquals(2, target.toAliasedData().size());
    }

    @Test
    void unregisteredKeysUseSimpleNameButAreNotImported() {
        var source = new FlowContext("source");
        source.put(Alpha.class, new Alpha("hello"));
        assertEquals(Map.of("Alpha", new Alpha("hello")), source.toAliasedData());
        var target = new FlowContext("target");
        target.fromAliasedData(source.toAliasedData());
        assertTrue(target.snapshot().isEmpty());
    }

    @Test
    @SuppressWarnings("deprecation")
    void legacyAliasMapStillContainsDataAndAcceptsUntypedValues() {
        var source = new FlowContext("source");
        source.registerAlias(Alpha.class, "alpha");
        source.put(Alpha.class, new Alpha("hello"));
        source.put(Beta.class, new Beta(7));
        var data = source.toAliasMap();
        assertEquals(Map.of("alpha", new Alpha("hello"), "Beta", new Beta(7)), data);
        var target = new FlowContext("target");
        target.registerAlias(Alpha.class, "alpha");
        target.fromAliasMap(data);
        assertEquals(new Alpha("hello"), target.get(Alpha.class));
        assertFalse(target.has(Beta.class));
        data.clear();
        assertEquals(2, source.toAliasMap().size());
        target.fromAliasMap(Map.of("alpha", "legacy-untyped"));
        assertEquals("legacy-untyped", target.snapshot().get(Alpha.class));
        var nullable = new LinkedHashMap<String, Object>();
        nullable.put("alpha", null);
        target.fromAliasMap(nullable);
        assertTrue(target.has(Alpha.class));
        assertNull(target.snapshot().get(Alpha.class));
    }
}
