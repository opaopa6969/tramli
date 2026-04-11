"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenarioGenerationPlugin = void 0;
const scenario_test_plugin_js_1 = require("./scenario-test-plugin.js");
class ScenarioGenerationPlugin {
    delegate = new scenario_test_plugin_js_1.ScenarioTestPlugin();
    descriptor() {
        return {
            id: 'scenario-tests',
            displayName: 'Scenario Test Generator',
            description: 'Produces scenario-oriented test plans from a flow definition.',
        };
    }
    kind() { return 'GENERATION'; }
    generate(input) {
        return this.delegate.generate(input);
    }
}
exports.ScenarioGenerationPlugin = ScenarioGenerationPlugin;
