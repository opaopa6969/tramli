package org.unlaxer.tramli.plugins.lint;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.Transition;
import org.unlaxer.tramli.plugins.api.PluginReport;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public final class DefaultFlowPolicies {
    private DefaultFlowPolicies() {}

    public static <S extends Enum<S> & FlowState> List<FlowPolicy<S>> all() {
        List<FlowPolicy<S>> policies = new ArrayList<>();
        policies.add(DefaultFlowPolicies::warnTerminalWithOutgoing);
        policies.add(DefaultFlowPolicies::warnTooManyExternals);
        policies.add(DefaultFlowPolicies::warnDeadProducedData);
        policies.add(DefaultFlowPolicies::warnOverwideProcessors);
        return policies;
    }

    private static <S extends Enum<S> & FlowState> void warnTerminalWithOutgoing(FlowDefinition<S> def, PluginReport report) {
        for (S state : def.terminalStates()) {
            if (!def.transitionsFrom(state).isEmpty()) {
                report.warn("policy/terminal-outgoing", "terminal state " + state + " has outgoing transitions");
            }
        }
    }

    private static <S extends Enum<S> & FlowState> void warnTooManyExternals(FlowDefinition<S> def, PluginReport report) {
        for (S state : def.allStates()) {
            long count = def.externalsFrom(state).size();
            if (count > 3) {
                report.warn("policy/external-count", "state " + state + " has " + count + " external transitions");
            }
        }
    }

    private static <S extends Enum<S> & FlowState> void warnDeadProducedData(FlowDefinition<S> def, PluginReport report) {
        Set<Class<?>> dead = def.dataFlowGraph().deadData();
        for (Class<?> type : dead) {
            report.warn("policy/dead-data", "produced but never consumed: " + type.getSimpleName());
        }
    }

    private static <S extends Enum<S> & FlowState> void warnOverwideProcessors(FlowDefinition<S> def, PluginReport report) {
        for (Transition<S> t : def.transitions()) {
            if (t.processor() != null && t.processor().produces().size() > 3) {
                report.warn("policy/overwide-processor",
                        t.processor().name() + " produces " + t.processor().produces().size() + " types; consider splitting it");
            }
        }
    }
}
