import { DiagramPlugin } from './diagram-plugin.js';
export class DiagramGenerationPlugin {
    delegate = new DiagramPlugin();
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
