package org.unlaxer.tramli.plugins.testing;

import java.util.List;

public record FlowScenario(String name, String kind, List<String> steps) {
    /** Backward-compatible constructor (kind = "happy"). */
    public FlowScenario(String name, List<String> steps) {
        this(name, "happy", steps);
    }
}
