"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentationPlugin = void 0;
/**
 * Generates a markdown flow catalog from a flow definition.
 */
class DocumentationPlugin {
    toMarkdown(definition) {
        const lines = [];
        lines.push(`# Flow Catalog: ${definition.name}`);
        lines.push('');
        lines.push('## States');
        lines.push('');
        for (const state of definition.allStates()) {
            const config = definition.stateConfig[state];
            let suffix = '';
            if (config?.initial)
                suffix += ' (initial)';
            if (config?.terminal)
                suffix += ' (terminal)';
            lines.push(`- \`${state}\`${suffix}`);
        }
        lines.push('');
        lines.push('## Transitions');
        lines.push('');
        for (const t of definition.transitions) {
            const via = t.processor?.name ?? t.guard?.name ?? t.branch?.name ?? t.type;
            lines.push(`- \`${t.from} -> ${t.to}\` via \`${via}\``);
        }
        return lines.join('\n');
    }
}
exports.DocumentationPlugin = DocumentationPlugin;
