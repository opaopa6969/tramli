"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HierarchyCodeGenerator = void 0;
/**
 * Generates TypeScript source from a hierarchical flow spec.
 * Flattens the hierarchy into a flat state config + builder skeleton.
 */
class HierarchyCodeGenerator {
    generateStateConfig(spec) {
        const flatStates = [];
        this.flatten(spec.rootStates, '', flatStates);
        const lines = [];
        lines.push(`// Generated state config for ${spec.flowName}`);
        lines.push(`import { Tramli } from '@unlaxer/tramli';`);
        lines.push('');
        lines.push(`export const ${spec.enumName} = {`);
        for (const s of flatStates) {
            lines.push(`  ${s.enumName}: { terminal: ${s.terminal}, initial: ${s.initial} },`);
        }
        lines.push('} as const;');
        lines.push('');
        lines.push(`export type ${spec.enumName}State = keyof typeof ${spec.enumName};`);
        return lines.join('\n');
    }
    generateBuilderSkeleton(spec) {
        const lines = [];
        lines.push(`// Generated builder skeleton for ${spec.flowName}`);
        lines.push(`import { Tramli } from '@unlaxer/tramli';`);
        lines.push(`import { ${spec.enumName} } from './${spec.enumName}.js';`);
        lines.push('');
        lines.push(`export function build${spec.flowName}() {`);
        lines.push(`  const b = Tramli.define('${spec.flowName}', ${spec.enumName});`);
        for (const t of spec.transitions) {
            lines.push(`  // ${t.trigger}: ${t.from} -> ${t.to} requires [${t.requires.join(', ')}] produces [${t.produces.join(', ')}]`);
        }
        lines.push('  return b.build();');
        lines.push('}');
        return lines.join('\n');
    }
    flatten(states, prefix, out) {
        for (const state of states) {
            const flat = (prefix ? `${prefix}_${state.name}` : state.name).toUpperCase();
            out.push({ enumName: flat, terminal: state.terminal, initial: state.initial });
            this.flatten(state.children, flat, out);
        }
    }
}
exports.HierarchyCodeGenerator = HierarchyCodeGenerator;
