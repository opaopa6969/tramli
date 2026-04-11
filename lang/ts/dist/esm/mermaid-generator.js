export class MermaidGenerator {
    static generate(def, options) {
        const lines = ['stateDiagram-v2'];
        if (def.initialState)
            lines.push(`  [*] --> ${def.initialState}`);
        const seen = new Set();
        for (const t of def.transitions) {
            if (t.type === 'sub_flow' && t.subFlowDefinition) {
                const subDef = t.subFlowDefinition;
                lines.push(`  state ${t.from} {`);
                if (subDef.initialState)
                    lines.push(`    [*] --> ${subDef.initialState}`);
                for (const st of subDef.transitions) {
                    const sLabel = this.transitionLabel(st);
                    lines.push(sLabel ? `    ${st.from} --> ${st.to}: ${sLabel}` : `    ${st.from} --> ${st.to}`);
                }
                for (const term of subDef.terminalStates)
                    lines.push(`    ${term} --> [*]`);
                lines.push('  }');
                if (t.exitMappings) {
                    for (const [exitName, target] of t.exitMappings) {
                        lines.push(`  ${t.from} --> ${target}: ${exitName}`);
                    }
                }
                continue;
            }
            const key = `${t.from}->${t.to}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const label = this.transitionLabel(t);
            lines.push(label ? `  ${t.from} --> ${t.to}: ${label}` : `  ${t.from} --> ${t.to}`);
        }
        if (!options?.excludeErrorTransitions) {
            for (const [from, to] of def.errorTransitions) {
                const key = `${from}->${to}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    lines.push(`  ${from} --> ${to}: error`);
                }
            }
        }
        for (const s of def.terminalStates) {
            lines.push(`  ${s} --> [*]`);
        }
        return lines.join('\n') + '\n';
    }
    /** Generate Mermaid diagram highlighting external transitions and their data contracts. */
    static generateExternalContract(def) {
        const lines = ['flowchart LR'];
        for (const t of def.transitions) {
            if (t.type !== 'external' || !t.guard)
                continue;
            lines.push(`    subgraph ${t.from}_to_${t.to}`);
            lines.push('        direction TB');
            lines.push(`        ${t.guard.name}{"[${t.guard.name}]"}`);
            for (const req of t.guard.requires)
                lines.push(`        ${req} -->|client sends| ${t.guard.name}`);
            for (const prod of t.guard.produces)
                lines.push(`        ${t.guard.name} -->|returns| ${prod}`);
            lines.push('    end');
        }
        return lines.join('\n') + '\n';
    }
    /** Generate Mermaid data-flow diagram from requires/produces declarations. */
    static generateDataFlow(def) {
        return def.dataFlowGraph?.toMermaid() ?? '';
    }
    static transitionLabel(t) {
        if (t.type === 'auto')
            return t.processor?.name ?? '';
        if (t.type === 'external')
            return t.guard ? `[${t.guard.name}]` : '';
        if (t.type === 'branch')
            return t.branch?.name ?? '';
        return '';
    }
}
