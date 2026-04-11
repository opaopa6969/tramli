"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagramGenerationPlugin = void 0;
const diagram_plugin_js_1 = require("./diagram-plugin.js");
class DiagramGenerationPlugin {
    delegate = new diagram_plugin_js_1.DiagramPlugin();
    descriptor() {
        return {
            id: 'diagram',
            displayName: 'Diagram Generator',
            description: 'Generates Mermaid and data-flow bundles from a flow definition.',
        };
    }
    kind() { return 'GENERATION'; }
    generate(input) {
        return this.delegate.generate(input);
    }
}
exports.DiagramGenerationPlugin = DiagramGenerationPlugin;
