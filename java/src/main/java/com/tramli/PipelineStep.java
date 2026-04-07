package com.tramli;

import java.util.Set;

/**
 * A step in a Pipeline. Like StateProcessor but without the FlowState generic.
 */
public interface PipelineStep {
    String name();
    Set<Class<?>> requires();
    Set<Class<?>> produces();
    void process(FlowContext ctx) throws FlowException;
}
