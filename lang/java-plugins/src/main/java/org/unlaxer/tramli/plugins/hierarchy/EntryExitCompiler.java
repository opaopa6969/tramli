package org.unlaxer.tramli.plugins.hierarchy;

import java.util.*;

public final class EntryExitCompiler {

    public List<HierarchicalTransitionSpec> synthesize(HierarchicalFlowSpec spec) {
        List<HierarchicalTransitionSpec> generated = new ArrayList<>();
        for (HierarchicalStateSpec state : spec.rootStates()) {
            synthesizeEntryExit(state, generated, null);
        }
        return generated;
    }

    public List<HierarchicalTransitionSpec> compileTransition(HierarchicalFlowSpec spec, String from, String to) {
        List<HierarchicalStateSpec> pathFrom = pathTo(spec.rootStates(), from);
        List<HierarchicalStateSpec> pathTo = pathTo(spec.rootStates(), to);
        if (pathFrom.isEmpty() || pathTo.isEmpty()) {
            return List.of();
        }

        int lcaIndex = lcaIndex(pathFrom, pathTo);
        List<HierarchicalTransitionSpec> result = new ArrayList<>();

        for (int i = pathFrom.size() - 1; i > lcaIndex; i--) {
            HierarchicalStateSpec state = pathFrom.get(i);
            if (!state.exitProduces().isEmpty()) {
                HierarchicalTransitionSpec exit = new HierarchicalTransitionSpec(
                        state.name(), state.name() + "__EXIT_END", "__exit__" + state.name());
                state.exitProduces().forEach(exit::produces);
                result.add(exit);
            }
        }

        for (int i = lcaIndex + 1; i < pathTo.size(); i++) {
            HierarchicalStateSpec state = pathTo.get(i);
            if (!state.entryProduces().isEmpty()) {
                String parentName = pathTo.get(i - 1).name();
                HierarchicalTransitionSpec entry = new HierarchicalTransitionSpec(
                        parentName, state.name(), "__entry__" + state.name());
                state.entryProduces().forEach(entry::produces);
                result.add(entry);
            }
        }

        return result;
    }

    public List<HierarchicalTransitionSpec> synthesizeBubbling(HierarchicalFlowSpec spec) {
        Map<String, Set<String>> handledTriggers = new HashMap<>();
        for (HierarchicalTransitionSpec t : spec.transitions()) {
            handledTriggers.computeIfAbsent(t.from(), k -> new HashSet<>()).add(t.trigger());
        }

        List<HierarchicalTransitionSpec> bubbled = new ArrayList<>();
        for (HierarchicalTransitionSpec t : spec.transitions()) {
            propagateBubbling(spec.rootStates(), t, handledTriggers, bubbled);
        }
        return bubbled;
    }

    public HierarchicalStateSpec lca(HierarchicalFlowSpec spec, String a, String b) {
        List<HierarchicalStateSpec> pathA = pathTo(spec.rootStates(), a);
        List<HierarchicalStateSpec> pathB = pathTo(spec.rootStates(), b);
        int idx = lcaIndex(pathA, pathB);
        return idx >= 0 ? pathA.get(idx) : null;
    }

    List<HierarchicalStateSpec> pathTo(List<HierarchicalStateSpec> roots, String name) {
        for (HierarchicalStateSpec root : roots) {
            List<HierarchicalStateSpec> path = new ArrayList<>();
            if (findPath(root, name, path)) {
                return path;
            }
        }
        return List.of();
    }

    private boolean findPath(HierarchicalStateSpec node, String name, List<HierarchicalStateSpec> path) {
        path.add(node);
        if (node.name().equals(name)) return true;
        for (HierarchicalStateSpec child : node.children()) {
            if (findPath(child, name, path)) return true;
        }
        path.remove(path.size() - 1);
        return false;
    }

    private int lcaIndex(List<HierarchicalStateSpec> pathA, List<HierarchicalStateSpec> pathB) {
        int lca = -1;
        for (int i = 0; i < Math.min(pathA.size(), pathB.size()); i++) {
            if (pathA.get(i).name().equals(pathB.get(i).name())) {
                lca = i;
            } else {
                break;
            }
        }
        return lca;
    }

    private void synthesizeEntryExit(HierarchicalStateSpec state, List<HierarchicalTransitionSpec> out, String parentName) {
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
            synthesizeEntryExit(child, out, state.name());
        }
    }

    private void propagateBubbling(List<HierarchicalStateSpec> roots, HierarchicalTransitionSpec parentTransition,
                                   Map<String, Set<String>> handledTriggers, List<HierarchicalTransitionSpec> out) {
        HierarchicalStateSpec fromState = findState(roots, parentTransition.from());
        if (fromState == null) return;

        for (HierarchicalStateSpec child : fromState.children()) {
            Set<String> childHandles = handledTriggers.getOrDefault(child.name(), Set.of());
            if (!childHandles.contains(parentTransition.trigger())) {
                HierarchicalTransitionSpec fallback = new HierarchicalTransitionSpec(
                        child.name(), parentTransition.to(), parentTransition.trigger());
                parentTransition.requires().forEach(fallback::requires);
                parentTransition.produces().forEach(fallback::produces);
                out.add(fallback);

                propagateBubbling(roots, fallback, handledTriggers, out);
            }
        }
    }

    private HierarchicalStateSpec findState(List<HierarchicalStateSpec> roots, String name) {
        for (HierarchicalStateSpec root : roots) {
            HierarchicalStateSpec found = findStateRecursive(root, name);
            if (found != null) return found;
        }
        return null;
    }

    private HierarchicalStateSpec findStateRecursive(HierarchicalStateSpec node, String name) {
        if (node.name().equals(name)) return node;
        for (HierarchicalStateSpec child : node.children()) {
            HierarchicalStateSpec found = findStateRecursive(child, name);
            if (found != null) return found;
        }
        return null;
    }
}
