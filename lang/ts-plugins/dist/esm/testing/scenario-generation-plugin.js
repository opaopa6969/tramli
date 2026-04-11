import { ScenarioTestPlugin } from './scenario-test-plugin.js';
export class ScenarioGenerationPlugin {
    delegate = new ScenarioTestPlugin();
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
