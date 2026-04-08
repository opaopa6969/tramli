package org.unlaxer.tramli.plugins.resume;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.FlowErrorType;
import org.unlaxer.tramli.FlowException;
import org.unlaxer.tramli.FlowInstance;
import org.unlaxer.tramli.FlowState;

import java.time.Instant;
import java.util.Map;

public final class RichResumeExecutor {
    private final FlowEngine engine;

    public RichResumeExecutor(FlowEngine engine) {
        this.engine = engine;
    }

    public <S extends Enum<S> & FlowState> RichResumeResult<S> resume(String flowId,
                                                                       FlowDefinition<S> definition,
                                                                       Map<Class<?>, Object> externalData,
                                                                       S knownBeforeState) {
        try {
            FlowInstance<S> flow = engine.resumeAndExecute(flowId, definition, externalData);
            if (flow.isCompleted() && "EXPIRED".equals(flow.exitState())) {
                return new RichResumeResult<>(RichResumeStatus.EXPIRED, knownBeforeState, flow.currentState(), "flow expired", null);
            }
            S after = flow.currentState();
            if (knownBeforeState == after) {
                return new RichResumeResult<>(RichResumeStatus.NO_APPLICABLE_TRANSITION, knownBeforeState, after,
                        "state unchanged at " + Instant.now(), null);
            }
            return new RichResumeResult<>(RichResumeStatus.TRANSITIONED, knownBeforeState, after,
                    knownBeforeState + " -> " + after, null);
        } catch (FlowException e) {
            if ("FLOW_ALREADY_COMPLETED".equals(e.code())) {
                return new RichResumeResult<>(RichResumeStatus.ALREADY_COMPLETED, knownBeforeState, null, e.getMessage(), e);
            }
            if ("INVALID_TRANSITION".equals(e.code())) {
                return new RichResumeResult<>(RichResumeStatus.NO_APPLICABLE_TRANSITION, knownBeforeState, knownBeforeState, e.getMessage(), e);
            }
            if (e.errorType() == FlowErrorType.BUSINESS) {
                return new RichResumeResult<>(RichResumeStatus.REJECTED, knownBeforeState, knownBeforeState, e.getMessage(), e);
            }
            return new RichResumeResult<>(RichResumeStatus.ERROR, knownBeforeState, knownBeforeState, e.getMessage(), e);
        }
    }
}
