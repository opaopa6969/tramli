package org.unlaxer.tramli.plugins.testing;

import java.util.Collections;
import java.util.List;

public final class FlowTestPlan {
    private final List<FlowScenario> scenarios;

    public FlowTestPlan(List<FlowScenario> scenarios) {
        this.scenarios = List.copyOf(scenarios);
    }

    public List<FlowScenario> scenarios() {
        return Collections.unmodifiableList(scenarios);
    }
}
