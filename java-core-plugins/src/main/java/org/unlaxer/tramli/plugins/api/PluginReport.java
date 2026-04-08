package org.unlaxer.tramli.plugins.api;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class PluginReport {
    public enum Severity { INFO, WARNING, ERROR }

    public record Finding(Severity severity, String pluginId, String message) {}

    private final List<Finding> findings = new ArrayList<>();

    public void info(String pluginId, String message) { findings.add(new Finding(Severity.INFO, pluginId, message)); }
    public void warn(String pluginId, String message) { findings.add(new Finding(Severity.WARNING, pluginId, message)); }
    public void error(String pluginId, String message) { findings.add(new Finding(Severity.ERROR, pluginId, message)); }

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
              .append(f.message())
              .append('\n');
        }
        return sb.toString();
    }
}
