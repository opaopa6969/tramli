import type { FlowDefinition } from '@unlaxer/tramli';
import type { PluginReport } from '../api/types.js';
import type { FlowPolicy } from './types.js';

function warnTerminalWithOutgoing<S extends string>(def: FlowDefinition<S>, report: PluginReport): void {
  for (const state of def.terminalStates) {
    if (def.transitionsFrom(state).length > 0) {
      report.warnAt('policy/terminal-outgoing',
        `terminal state ${state} has outgoing transitions`,
        { type: 'state', state });
    }
  }
}

function warnTooManyExternals<S extends string>(def: FlowDefinition<S>, report: PluginReport): void {
  for (const state of def.allStates()) {
    const externals = def.transitionsFrom(state).filter(t => t.type === 'external');
    if (externals.length > 3) {
      report.warnAt('policy/external-count',
        `state ${state} has ${externals.length} external transitions`,
        { type: 'state', state });
    }
  }
}

function warnDeadProducedData<S extends string>(def: FlowDefinition<S>, report: PluginReport): void {
  if (!def.dataFlowGraph) return;
  const dead = def.dataFlowGraph.deadData();
  for (const key of dead) {
    report.warnAt('policy/dead-data',
      `produced but never consumed: ${key}`,
      { type: 'data', dataKey: key });
  }
}

function warnOverwideProcessors<S extends string>(def: FlowDefinition<S>, report: PluginReport): void {
  for (const t of def.transitions) {
    if (t.processor && t.processor.produces.length > 3) {
      report.warnAt('policy/overwide-processor',
        `${t.processor.name} produces ${t.processor.produces.length} types; consider splitting it`,
        { type: 'transition', fromState: t.from, toState: t.to });
    }
  }
}

export function allDefaultPolicies<S extends string>(): FlowPolicy<S>[] {
  return [
    warnTerminalWithOutgoing,
    warnTooManyExternals,
    warnDeadProducedData,
    warnOverwideProcessors,
  ];
}
