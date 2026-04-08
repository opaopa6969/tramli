package org.unlaxer.tramli.plugins.audit;

import java.time.temporal.TemporalAccessor;
import java.util.UUID;

public final class DefaultProducedDataSerializer implements ProducedDataSerializer {
    @Override
    public String serialize(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        if (value instanceof CharSequence || value instanceof Enum<?> || value instanceof UUID || value instanceof TemporalAccessor) {
            return '"' + escape(String.valueOf(value)) + '"';
        }
        return '"' + escape(String.valueOf(value)) + '"';
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
