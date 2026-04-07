package com.tramli;

import java.util.List;

/**
 * Thrown when a pipeline step fails during execution.
 */
public class PipelineException extends FlowException {
    private final List<String> completedSteps;
    private final String failedStep;
    private final FlowContext context;

    public PipelineException(String failedStep, List<String> completedSteps,
                              FlowContext context, Throwable cause) {
        super("PIPELINE_STEP_FAILED",
                "Pipeline step '" + failedStep + "' failed: " + cause.getMessage(), cause);
        this.failedStep = failedStep;
        this.completedSteps = List.copyOf(completedSteps);
        this.context = context;
    }

    public List<String> completedSteps() { return completedSteps; }
    public String failedStep() { return failedStep; }
    public FlowContext context() { return context; }
}
