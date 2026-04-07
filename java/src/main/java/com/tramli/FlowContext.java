package com.tramli;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Accumulator for flow data. Each processor puts its produces,
 * subsequent processors get their requires. Keyed by Class —
 * each data type appears at most once.
 *
 * <h3>Key Design Pattern</h3>
 * Use dedicated record types as keys (e.g., {@code OrderRequest.class},
 * {@code PaymentResult.class}), not primitive wrappers or {@code String.class}.
 * Putting the same Class key twice silently overwrites the previous value.
 */
public final class FlowContext {
    private final String flowId;
    private final Instant createdAt;
    private final Map<Class<?>, Object> attributes;

    public FlowContext(String flowId) {
        this(flowId, Instant.now(), new LinkedHashMap<>());
    }

    public FlowContext(String flowId, Instant createdAt, Map<Class<?>, Object> attributes) {
        this.flowId = flowId;
        this.createdAt = createdAt;
        this.attributes = new LinkedHashMap<>(attributes);
    }

    public String flowId() { return flowId; }
    public Instant createdAt() { return createdAt; }

    @SuppressWarnings("unchecked")
    public <T> T get(Class<T> key) {
        Object value = attributes.get(key);
        if (value == null) {
            throw FlowException.missingContext(key);
        }
        return (T) value;
    }

    @SuppressWarnings("unchecked")
    public <T> Optional<T> find(Class<T> key) {
        return Optional.ofNullable((T) attributes.get(key));
    }

    public <T> void put(Class<T> key, T value) {
        attributes.put(key, value);
    }

    public boolean has(Class<?> key) {
        return attributes.containsKey(key);
    }

    // ─── Alias support (for serialization) ──────────────────

    private final Map<String, Class<?>> aliasToClass = new LinkedHashMap<>();
    private final Map<Class<?>, String> classToAlias = new LinkedHashMap<>();

    /** Register a string alias for a type. Used for cross-language serialization. */
    public void registerAlias(Class<?> type, String alias) {
        aliasToClass.put(alias, type);
        classToAlias.put(type, alias);
    }

    /** Export context as alias → value map (for JSON serialization). */
    public Map<String, Object> toAliasMap() {
        var map = new LinkedHashMap<String, Object>();
        for (var entry : attributes.entrySet()) {
            String alias = classToAlias.getOrDefault(entry.getKey(), entry.getKey().getSimpleName());
            map.put(alias, entry.getValue());
        }
        return map;
    }

    /** Import context from alias → value map (for deserialization). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void fromAliasMap(Map<String, Object> map) {
        for (var entry : map.entrySet()) {
            Class<?> clazz = aliasToClass.get(entry.getKey());
            if (clazz != null) {
                attributes.put(clazz, entry.getValue());
            }
        }
    }

    public Map<Class<?>, Object> snapshot() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(attributes));
    }

    public void restoreFrom(Map<Class<?>, Object> snapshot) {
        attributes.clear();
        attributes.putAll(snapshot);
    }
}
