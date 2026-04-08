package org.unlaxer.tramli.plugins.testing;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.Transition;

import java.util.ArrayList;
import java.util.List;

public final class ScenarioTestPlugin {
    public <S extends Enum<S> & FlowState> FlowTestPlan generate(FlowDefinition<S> definition) {
        List<FlowScenario> scenarios = new ArrayList<>();
        for (Transition<S> t : definition.transitions()) {
            List<String> steps = new ArrayList<>();
            steps.add("given flow in " + t.from());
            if (t.isExternal()) steps.add("when external data satisfies guard " + t.guard().name());
            if (t.isAuto()) steps.add("when auto processor " + t.processor().name() + " runs");
            if (t.isBranch()) steps.add("when branch " + t.branch().name() + " selects a route");
            steps.add("then flow reaches " + t.to());
            scenarios.add(new FlowScenario(t.from() + "_to_" + t.to(), steps));
        }
        return new FlowTestPlan(scenarios);
    }
}
