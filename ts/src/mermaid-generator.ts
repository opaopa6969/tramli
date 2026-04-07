import type { FlowDefinition } from './flow-definition.js';
import type { Transition } from './types.js';

export class MermaidGenerator {
  static generate<S extends string>(def: FlowDefinition<S>): string {
    const lines: string[] = ['stateDiagram-v2'];
    if (def.initialState) lines.push(`  [*] --> ${def.initialState}`);

    const seen = new Set<string>();
    for (const t of def.transitions) {
      const key = `${t.from}->${t.to}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const label = this.transitionLabel(t);
      lines.push(label ? `  ${t.from} --> ${t.to}: ${label}` : `  ${t.from} --> ${t.to}`);
    }

    for (const [from, to] of def.errorTransitions) {
      const key = `${from}->${to}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`  ${from} --> ${to}: error`);
      }
    }

    for (const s of def.terminalStates) {
      lines.push(`  ${s} --> [*]`);
    }

    return lines.join('\n') + '\n';
  }

  /** Generate Mermaid data-flow diagram from requires/produces declarations. */
  static generateDataFlow<S extends string>(def: FlowDefinition<S>): string {
    return def.dataFlowGraph?.toMermaid() ?? '';
  }

  private static transitionLabel<S extends string>(t: Transition<S>): string {
    if (t.type === 'auto') return t.processor?.name ?? '';
    if (t.type === 'external') return t.guard ? `[${t.guard.name}]` : '';
    if (t.type === 'branch') return t.branch?.name ?? '';
    return '';
  }
}
