import type { FlowDefinition } from '@unlaxer/tramli';
/**
 * Generates a markdown flow catalog from a flow definition.
 */
export declare class DocumentationPlugin {
    toMarkdown<S extends string>(definition: FlowDefinition<S>): string;
}
