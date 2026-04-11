package org.unlaxer.tramli.plugins.hierarchy;

import java.util.ArrayList;
import java.util.List;

public final class EntryExitCompiler {
    public List<HierarchicalTransitionSpec> synthesize(HierarchicalFlowSpec spec) {
        List<HierarchicalTransitionSpec> generated = new ArrayList<>();
        for (HierarchicalStateSpec state : spec.rootStates()) {
            synthesize(state, generated, null);
        }
        return generated;
    }

    private void synthesize(HierarchicalStateSpec state, List<HierarchicalTransitionSpec> out, String parentName) {
        if (!state.entryProduces().isEmpty()) {
            HierarchicalTransitionSpec entry = new HierarchicalTransitionSpec(
                    parentName == null ? state.name() + "__ENTRY_START" : parentName,
                    state.name(),
                    "__entry__" + state.name());
            state.entryProduces().forEach(entry::produces);
            out.add(entry);
        }
        if (!state.exitProduces().isEmpty()) {
            HierarchicalTransitionSpec exit = new HierarchicalTransitionSpec(
                    state.name(),
                    state.name() + "__EXIT_END",
                    "__exit__" + state.name());
            state.exitProduces().forEach(exit::produces);
            out.add(exit);
        }
        for (HierarchicalStateSpec child : state.children()) {
            synthesize(child, out, state.name());
        }
    }
}
