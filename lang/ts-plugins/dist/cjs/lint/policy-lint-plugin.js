"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyLintPlugin = void 0;
const types_js_1 = require("../api/types.js");
const default_flow_policies_js_1 = require("./default-flow-policies.js");
class PolicyLintPlugin {
    policies;
    constructor(policies) {
        this.policies = policies;
    }
    static defaults() {
        return new PolicyLintPlugin((0, default_flow_policies_js_1.allDefaultPolicies)());
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
        const r = report ?? new types_js_1.PluginReport();
        for (const policy of this.policies) {
            policy(definition, r);
        }
        return r;
    }
}
exports.PolicyLintPlugin = PolicyLintPlugin;
