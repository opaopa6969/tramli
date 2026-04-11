import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
export class Tramli {
    static define(name, stateConfig) {
        return new Builder(name, stateConfig);
    }
    static engine(store) {
        return new FlowEngine(store);
    }
}
