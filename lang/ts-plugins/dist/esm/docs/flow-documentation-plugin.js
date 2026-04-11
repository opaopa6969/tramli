import { DocumentationPlugin } from './documentation-plugin.js';
export class FlowDocumentationPlugin {
    delegate = new DocumentationPlugin();
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
