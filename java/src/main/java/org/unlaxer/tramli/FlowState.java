package org.unlaxer.tramli;

/**
 * Marker interface for all flow state enums.
 * Each flow defines its own enum implementing this interface.
 */
public interface FlowState {
    String name();
    boolean isTerminal();
    boolean isInitial();
}
