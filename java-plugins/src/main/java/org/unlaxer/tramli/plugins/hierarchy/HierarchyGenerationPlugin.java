package org.unlaxer.tramli.plugins.hierarchy;

import org.unlaxer.tramli.plugins.api.GenerationPlugin;
import org.unlaxer.tramli.plugins.api.PluginDescriptor;

import java.util.Map;

public final class HierarchyGenerationPlugin implements GenerationPlugin<HierarchicalFlowSpec, Map<String, String>> {
    private final String packageName;
    private final HierarchyCodeGenerator generator = new HierarchyCodeGenerator();

    public HierarchyGenerationPlugin(String packageName) {
        this.packageName = packageName;
    }

    @Override
    public PluginDescriptor descriptor() {
        return new PluginDescriptor("hierarchy", "Hierarchy Generator", "Compiles hierarchical authoring specs into flat Java enum and builder skeleton sources.");
    }

    @Override
    public Map<String, String> generate(HierarchicalFlowSpec input) {
        return Map.of(
                input.enumName() + ".java", generator.generateEnumSource(input, packageName),
                input.flowName() + "Generated.java", generator.generateBuilderSkeleton(input, packageName)
        );
    }
}
