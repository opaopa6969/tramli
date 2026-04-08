package org.unlaxer.tramli.plugins.hierarchy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class HierarchicalTransitionSpec {
    private final String from;
    private final String to;
    private final String trigger;
    private final List<String> requires = new ArrayList<>();
    private final List<String> produces = new ArrayList<>();

    public HierarchicalTransitionSpec(String from, String to, String trigger) {
        this.from = from;
        this.to = to;
        this.trigger = trigger;
    }

    public String from() { return from; }
    public String to() { return to; }
    public String trigger() { return trigger; }
    public List<String> requires() { return Collections.unmodifiableList(requires); }
    public List<String> produces() { return Collections.unmodifiableList(produces); }
    public HierarchicalTransitionSpec requires(String typeAlias) { requires.add(typeAlias); return this; }
    public HierarchicalTransitionSpec produces(String typeAlias) { produces.add(typeAlias); return this; }
}
