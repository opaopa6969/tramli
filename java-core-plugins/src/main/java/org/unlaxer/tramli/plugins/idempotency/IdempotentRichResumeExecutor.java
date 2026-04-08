package org.unlaxer.tramli.plugins.idempotency;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowEngine;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.resume.RichResumeExecutor;
import org.unlaxer.tramli.plugins.resume.RichResumeResult;
import org.unlaxer.tramli.plugins.resume.RichResumeStatus;

public final class IdempotentRichResumeExecutor {
    private final IdempotencyRegistry registry;
    private final RichResumeExecutor delegate;

    public IdempotentRichResumeExecutor(FlowEngine engine, IdempotencyRegistry registry) {
        this.registry = registry;
        this.delegate = new RichResumeExecutor(engine);
    }

    public <S extends Enum<S> & FlowState> RichResumeResult<S> resume(String flowId,
                                                                       FlowDefinition<S> definition,
                                                                       CommandEnvelope envelope,
                                                                       S knownBeforeState) {
        if (!registry.markIfFirstSeen(flowId, envelope.commandId())) {
            return new RichResumeResult<>(RichResumeStatus.ALREADY_COMPLETED, knownBeforeState, knownBeforeState,
                    "duplicate commandId " + envelope.commandId(), null);
        }
        return delegate.resume(flowId, definition, envelope.externalData(), knownBeforeState);
    }
}
