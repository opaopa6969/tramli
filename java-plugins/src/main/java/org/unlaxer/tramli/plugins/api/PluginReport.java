package org.unlaxer.tramli.plugins.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class PluginReport {
    public enum Severity { INFO, WARNING, ERROR }

    /** Describes where in a flow definition a finding is located. */
    public sealed interface FindingLocation
            permits FindingLocation.TransitionLoc, FindingLocation.StateLoc,
                    FindingLocation.DataLoc, FindingLocation.FlowLoc {

        record TransitionLoc(String fromState, String toState) implements FindingLocation {}
        record StateLoc(String state) implements FindingLocation {}
        record DataLoc(String dataKey) implements FindingLocation {}
        record FlowLoc() implements FindingLocation {}
    }

    public record Finding(Severity severity, String pluginId, String message, FindingLocation location) {
        /** Backward-compatible constructor (location = null). */
        public Finding(Severity severity, String pluginId, String message) {
            this(severity, pluginId, message, null);
        }
    }

    private final List<Finding> findings = new ArrayList<>();

    public void info(String pluginId, String message) { findings.add(new Finding(Severity.INFO, pluginId, message)); }
    public void warn(String pluginId, String message) { findings.add(new Finding(Severity.WARNING, pluginId, message)); }
    public void error(String pluginId, String message) { findings.add(new Finding(Severity.ERROR, pluginId, message)); }

    public void warnAt(String pluginId, String message, FindingLocation location) {
        findings.add(new Finding(Severity.WARNING, pluginId, message, location));
    }

    public void errorAt(String pluginId, String message, FindingLocation location) {
        findings.add(new Finding(Severity.ERROR, pluginId, message, location));
    }

    public boolean hasErrors() {
        return findings.stream().anyMatch(f -> f.severity() == Severity.ERROR);
    }

    public List<Finding> findings() { return Collections.unmodifiableList(findings); }

    public String asText() {
        StringBuilder sb = new StringBuilder();
        for (Finding f : findings) {
            sb.append('[')
              .append(f.severity())
              .append("] ")
              .append(f.pluginId())
              .append(": ")
              .append(f.message());
            if (f.location() != null) {
                sb.append(" @ ").append(formatLocation(f.location()));
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    private static String formatLocation(FindingLocation loc) {
        return switch (loc) {
            case FindingLocation.TransitionLoc t -> "transition(" + t.fromState() + " -> " + t.toState() + ")";
            case FindingLocation.StateLoc s -> "state(" + s.state() + ")";
            case FindingLocation.DataLoc d -> "data(" + d.dataKey() + ")";
            case FindingLocation.FlowLoc f -> "flow";
        };
    }
}
