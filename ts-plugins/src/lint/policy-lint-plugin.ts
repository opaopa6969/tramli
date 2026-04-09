import type { FlowDefinition } from '@unlaxer/tramli';
import type { AnalysisPlugin, PluginDescriptor } from '../api/types.js';
import { PluginReport } from '../api/types.js';
import type { FlowPolicy } from './types.js';
import { allDefaultPolicies } from './default-flow-policies.js';

export class PolicyLintPlugin<S extends string> implements AnalysisPlugin<S> {
  constructor(private readonly policies: FlowPolicy<S>[]) {}

  static defaults<S extends string>(): PolicyLintPlugin<S> {
    return new PolicyLintPlugin(allDefaultPolicies<S>());
  }

  descriptor(): PluginDescriptor {
    return {
      id: 'policy-lint',
      displayName: 'Policy Lint',
      description: 'Applies design-time lint policies to a flow definition.',
    };
  }
  kind() { return 'ANALYSIS' as const; }

  analyze(definition: FlowDefinition<S>, report?: PluginReport): PluginReport {
    const r = report ?? new PluginReport();
    for (const policy of this.policies) {
      policy(definition, r);
    }
    return r;
  }
}
