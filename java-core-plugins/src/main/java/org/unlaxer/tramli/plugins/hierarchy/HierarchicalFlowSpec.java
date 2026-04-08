package org.unlaxer.tramli.plugins.hierarchy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class HierarchicalFlowSpec {
    private final String flowName;
    private final String enumName;
    private final List<HierarchicalStateSpec> rootStates = new ArrayList<>();
    private final List<HierarchicalTransitionSpec> transitions = new ArrayList<>();

    public HierarchicalFlowSpec(String flowName, String enumName) {
        this.flowName = flowName;
        this.enumName = enumName;
    }

    public String flowName() { return flowName; }
    public String enumName() { return enumName; }
    public List<HierarchicalStateSpec> rootStates() { return Collections.unmodifiableList(rootStates); }
    public List<HierarchicalTransitionSpec> transitions() { return Collections.unmodifiableList(transitions); }
    public HierarchicalFlowSpec state(HierarchicalStateSpec state) { rootStates.add(state); return this; }
    public HierarchicalFlowSpec transition(HierarchicalTransitionSpec transition) { transitions.add(transition); return this; }
}
