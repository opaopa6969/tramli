package org.unlaxer.tramli.plugins.lint;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.api.AnalysisPlugin;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;
import org.unlaxer.tramli.plugins.api.PluginReport;

import java.util.List;

public final class PolicyLintPlugin<S extends Enum<S> & FlowState> implements AnalysisPlugin<S> {
    private final List<FlowPolicy<S>> policies;

    public PolicyLintPlugin(List<FlowPolicy<S>> policies) {
        this.policies = policies;
    }

    @SuppressWarnings("unchecked")
    public static <S extends Enum<S> & FlowState> PolicyLintPlugin<S> defaults() {
        return new PolicyLintPlugin<>((List<FlowPolicy<S>>) (List<?>) DefaultFlowPolicies.all());
    }

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("policy-lint", "Policy Lint", "Applies design-time lint policies to a flow definition.");
    }

    @Override
    public void analyze(FlowDefinition<S> definition, PluginReport report) {
        for (FlowPolicy<S> policy : policies) {
            policy.apply(definition, report);
        }
    }
}
