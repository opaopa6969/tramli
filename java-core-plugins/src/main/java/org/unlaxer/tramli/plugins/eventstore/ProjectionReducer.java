package org.unlaxer.tramli.plugins.eventstore;

public interface ProjectionReducer<V> {
    V initialState();
    V apply(V current, VersionedTransitionEvent event);
}
