package org.unlaxer.tramli.plugins.api;

import org.unlaxer.tramli.FlowDefinition;
import org.unlaxer.tramli.FlowState;

public interface AnalysisPlugin<S extends Enum<S> & FlowState> extends FlowPlugin {
    void analyze(FlowDefinition<S> definition, PluginReport report);

    @Override
    default PluginKind kind() {
        return PluginKind.ANALYSIS;
    }
}
