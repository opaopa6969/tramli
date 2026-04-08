package com.tramli;

import java.util.Set;

/**
 * Common contract for anything that processes data in a flow.
 * Both {@link StateProcessor} and {@link PipelineStep} extend this.
 */
public interface ProcessorContract {
    String name();
    Set<Class<?>> requires();
    Set<Class<?>> produces();
    void process(FlowContext ctx) throws FlowException;
}
