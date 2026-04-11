import { PluginReport } from '../api/types.js';
import { allDefaultPolicies } from './default-flow-policies.js';
export class PolicyLintPlugin {
    policies;
    constructor(policies) {
        this.policies = policies;
    }
    static defaults() {
        return new PolicyLintPlugin(allDefaultPolicies());
    }
    descriptor() {
        return {
            id: 'policy-lint',
            displayName: 'Policy Lint',
            description: 'Applies design-time lint policies to a flow definition.',
        };
    }
    kind() { return 'ANALYSIS'; }
    analyze(definition, report) {
        const r = report ?? new PluginReport();
        for (const policy of this.policies) {
            policy(definition, r);
        }
        return r;
    }
}
