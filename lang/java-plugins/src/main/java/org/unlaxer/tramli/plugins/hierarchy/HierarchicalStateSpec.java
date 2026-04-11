package org.unlaxer.tramli.plugins.hierarchy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class HierarchicalStateSpec {
    private final String name;
    private final boolean initial;
    private final boolean terminal;
    private final List<String> entryProduces = new ArrayList<>();
    private final List<String> exitProduces = new ArrayList<>();
    private final List<HierarchicalStateSpec> children = new ArrayList<>();

    public HierarchicalStateSpec(String name, boolean initial, boolean terminal) {
        this.name = name;
        this.initial = initial;
        this.terminal = terminal;
    }

    public String name() { return name; }
    public boolean initial() { return initial; }
    public boolean terminal() { return terminal; }
    public List<String> entryProduces() { return Collections.unmodifiableList(entryProduces); }
    public List<String> exitProduces() { return Collections.unmodifiableList(exitProduces); }
    public List<HierarchicalStateSpec> children() { return Collections.unmodifiableList(children); }

    public HierarchicalStateSpec entryProduces(String typeAlias) { entryProduces.add(typeAlias); return this; }
    public HierarchicalStateSpec exitProduces(String typeAlias) { exitProduces.add(typeAlias); return this; }
    public HierarchicalStateSpec child(HierarchicalStateSpec state) { children.add(state); return this; }
}
