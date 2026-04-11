import { Builder } from './flow-definition.js';
import { FlowEngine } from './flow-engine.js';
import { PipelineBuilder } from './pipeline.js';
export class Tramli {
    static define(name, stateConfig) {
        return new Builder(name, stateConfig);
    }
    static engine(store, options) {
        return new FlowEngine(store, options);
    }
    /** Create a Map<string, unknown> from flowKey-value pairs. */
    static data(...pairs) {
        const map = new Map();
        for (const [key, value] of pairs)
            map.set(key, value);
        return map;
    }
    static pipeline(name) {
        return new PipelineBuilder(name);
    }
}
