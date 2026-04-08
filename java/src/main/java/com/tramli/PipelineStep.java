package com.tramli;

import java.util.Set;

/**
 * A step in a Pipeline. Like StateProcessor but without the FlowState generic.
 */
public interface PipelineStep extends ProcessorContract {
    // All methods inherited from ProcessorContract.
    // PipelineStep exists for semantic clarity in Pipeline context.
    // A StateProcessor can be used directly as a PipelineStep (same interface).
}
