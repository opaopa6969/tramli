/** Plugin report — collects analysis findings. */
export class PluginReport {
    entries = [];
    add(pluginId, severity, message) {
        this.entries.push({ pluginId, severity, message });
    }
    warn(pluginId, message) {
        this.add(pluginId, 'WARN', message);
    }
    error(pluginId, message) {
        this.add(pluginId, 'ERROR', message);
    }
    warnAt(pluginId, message, location) {
        this.entries.push({ pluginId, severity: 'WARN', message, location });
    }
    errorAt(pluginId, message, location) {
        this.entries.push({ pluginId, severity: 'ERROR', message, location });
    }
    asText() {
        if (this.entries.length === 0)
            return 'No findings.';
        return this.entries.map(e => {
            let text = `[${e.severity}] ${e.pluginId}: ${e.message}`;
            if (e.location)
                text += ` @ ${formatLocation(e.location)}`;
            return text;
        }).join('\n');
    }
    findings() { return [...this.entries]; }
}
function formatLocation(loc) {
    switch (loc.type) {
        case 'transition': return `transition(${loc.fromState} -> ${loc.toState})`;
        case 'state': return `state(${loc.state})`;
        case 'data': return `data(${loc.dataKey})`;
        case 'flow': return 'flow';
    }
}
