package org.unlaxer.tramli.plugins.testing;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.Transition;

import java.util.ArrayList;
import java.util.List;

public final class ScenarioTestPlugin {
    public <S extends Enum<S> & FlowState> FlowTestPlan generate(FlowDefinition<S> definition) {
        List<FlowScenario> scenarios = new ArrayList<>();

        // Happy path scenarios from transitions
        for (Transition<S> t : definition.transitions()) {
            List<String> steps = new ArrayList<>();
            steps.add("given flow in " + t.from());
            if (t.isExternal()) steps.add("when external data satisfies guard " + t.guard().name());
            if (t.isAuto()) steps.add("when auto processor " + t.processor().name() + " runs");
            if (t.isBranch()) steps.add("when branch " + t.branch().name() + " selects a route");
            steps.add("then flow reaches " + t.to());
            scenarios.add(new FlowScenario(t.from() + "_to_" + t.to(), "happy", steps));
        }

        // Error path scenarios from errorTransitions
        for (var entry : definition.errorTransitions().entrySet()) {
            S from = entry.getKey();
            S to = entry.getValue();
            scenarios.add(new FlowScenario(
                "error_" + from + "_to_" + to, "error",
                List.of(
                    "given flow in " + from,
                    "when processor throws an error",
                    "then flow transitions to " + to + " via on_error"
                )
            ));
        }

        // Exception route scenarios
        for (var entry : definition.exceptionRoutes().entrySet()) {
            S from = entry.getKey();
            for (var route : entry.getValue()) {
                String label = route.exceptionType().getSimpleName();
                scenarios.add(new FlowScenario(
                    "step_error_" + from + "_" + label + "_to_" + route.target(), "error",
                    List.of(
                        "given flow in " + from,
                        "when error matching " + label + " is thrown",
                        "then flow transitions to " + route.target() + " via on_step_error"
                    )
                ));
            }
        }

        // Guard rejection scenarios
        for (Transition<S> t : definition.transitions()) {
            if (t.isExternal() && t.guard() != null) {
                S errorTarget = definition.errorTransitions().get(t.from());
                scenarios.add(new FlowScenario(
                    "guard_reject_" + t.from() + "_" + t.guard().name(), "guard_rejection",
                    List.of(
                        "given flow in " + t.from(),
                        "when guard " + t.guard().name() + " rejects " + definition.maxGuardRetries() + " times",
                        errorTarget != null
                            ? "then flow transitions to " + errorTarget + " via error"
                            : "then flow enters TERMINAL_ERROR"
                    )
                ));
            }
        }

        // Timeout scenarios
        for (Transition<S> t : definition.transitions()) {
            if (t.timeout() != null) {
                scenarios.add(new FlowScenario(
                    "timeout_" + t.from(), "timeout",
                    List.of(
                        "given flow in " + t.from(),
                        "when per-state timeout of " + t.timeout().toMillis() + "ms expires",
                        "then flow completes as EXPIRED"
                    )
                ));
            }
        }

        return new FlowTestPlan(scenarios);
    }
}
