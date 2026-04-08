package org.unlaxer.tramli.plugins.lint;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;
import org.unlaxer.tramli.plugins.api.PluginReport;

@FunctionalInterface
public interface FlowPolicy<S extends Enum<S> & FlowState> {
    void apply(FlowDefinition<S> definition, PluginReport report);
}
