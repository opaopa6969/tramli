"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowDocumentationPlugin = void 0;
const documentation_plugin_js_1 = require("./documentation-plugin.js");
class FlowDocumentationPlugin {
    delegate = new documentation_plugin_js_1.DocumentationPlugin();
    descriptor() {
        return {
            id: 'docs',
            displayName: 'Documentation Generator',
            description: 'Renders a markdown flow catalog from a flow definition.',
        };
    }
    kind() { return 'DOCUMENTATION'; }
    generate(input) {
        return this.delegate.toMarkdown(input);
    }
}
exports.FlowDocumentationPlugin = FlowDocumentationPlugin;
