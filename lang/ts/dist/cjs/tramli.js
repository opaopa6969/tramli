"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tramli = void 0;
const flow_definition_js_1 = require("./flow-definition");
const flow_engine_js_1 = require("./flow-engine");
const pipeline_js_1 = require("./pipeline");
class Tramli {
    static define(name, stateConfig) {
        return new flow_definition_js_1.Builder(name, stateConfig);
    }
    static engine(store, options) {
        return new flow_engine_js_1.FlowEngine(store, options);
    }
    /** Create a Map<string, unknown> from flowKey-value pairs. */
    static data(...pairs) {
        const map = new Map();
        for (const [key, value] of pairs)
            map.set(key, value);
        return map;
    }
    static pipeline(name) {
        return new pipeline_js_1.PipelineBuilder(name);
    }
}
exports.Tramli = Tramli;
