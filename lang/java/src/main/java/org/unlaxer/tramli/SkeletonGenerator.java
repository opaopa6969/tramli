package org.unlaxer.tramli;

import java.util.*;

/**
 * Generates Processor skeleton code from a FlowDefinition's requires/produces contracts.
 * Useful for cross-language migration: generate skeletons in the target language.
 */
public final class SkeletonGenerator {

    private SkeletonGenerator() {}

    public enum Language { JAVA, TYPESCRIPT, RUST }

    /**
     * Generate skeleton code for all processors and guards in the flow definition.
     */
    public static <S extends Enum<S> & FlowState> String generate(
            FlowDefinition<S> definition, Language language) {
        var sb = new StringBuilder();
        sb.append("// Skeleton generated from flow: ").append(definition.name()).append('\n');
        sb.append("// Language: ").append(language).append("\n\n");

        var seen = new LinkedHashSet<String>();
        for (var t : definition.transitions()) {
            if (t.processor() != null && seen.add(t.processor().name())) {
                sb.append(generateProcessor(t.processor(), language));
                sb.append('\n');
            }
            if (t.guard() != null && seen.add(t.guard().name())) {
                sb.append(generateGuard(t.guard(), language));
                sb.append('\n');
            }
        }
        return sb.toString();
    }

    private static String generateProcessor(StateProcessor proc, Language lang) {
        var reqs = proc.requires().stream().map(Class::getSimpleName).sorted().toList();
        var prods = proc.produces().stream().map(Class::getSimpleName).sorted().toList();

        return switch (lang) {
            case JAVA -> javaProcessor(proc.name(), reqs, prods);
            case TYPESCRIPT -> tsProcessor(proc.name(), reqs, prods);
            case RUST -> rustProcessor(proc.name(), reqs, prods);
        };
    }

    private static String generateGuard(TransitionGuard guard, Language lang) {
        var reqs = guard.requires().stream().map(Class::getSimpleName).sorted().toList();
        var prods = guard.produces().stream().map(Class::getSimpleName).sorted().toList();

        return switch (lang) {
            case JAVA -> javaGuard(guard.name(), reqs, prods);
            case TYPESCRIPT -> tsGuard(guard.name(), reqs, prods);
            case RUST -> rustGuard(guard.name(), reqs, prods);
        };
    }

    private static String javaProcessor(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("static final StateProcessor ").append(toConstName(name)).append(" = new StateProcessor() {\n");
        sb.append("    @Override public String name() { return \"").append(name).append("\"; }\n");
        sb.append("    @Override public Set<Class<?>> requires() { return Set.of(");
        sb.append(String.join(", ", reqs.stream().map(r -> r + ".class").toList()));
        sb.append("); }\n");
        sb.append("    @Override public Set<Class<?>> produces() { return Set.of(");
        sb.append(String.join(", ", prods.stream().map(p -> p + ".class").toList()));
        sb.append("); }\n");
        sb.append("    @Override public void process(FlowContext ctx) {\n");
        for (var r : reqs) sb.append("        var ").append(toLowerCamel(r)).append(" = ctx.get(").append(r).append(".class);\n");
        sb.append("        // TODO: implement business logic\n");
        for (var p : prods) sb.append("        // ctx.put(").append(p).append(".class, new ").append(p).append("(...));\n");
        sb.append("    }\n};\n");
        return sb.toString();
    }

    private static String tsProcessor(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("const ").append(toLowerCamel(name)).append(": StateProcessor<S> = {\n");
        sb.append("  name: '").append(name).append("',\n");
        sb.append("  requires: [").append(String.join(", ", reqs)).append("],\n");
        sb.append("  produces: [").append(String.join(", ", prods)).append("],\n");
        sb.append("  process(ctx: FlowContext) {\n");
        for (var r : reqs) sb.append("    const ").append(toLowerCamel(r)).append(" = ctx.get(").append(r).append(");\n");
        sb.append("    // TODO: implement business logic\n");
        for (var p : prods) sb.append("    // ctx.put(").append(p).append(", { ... });\n");
        sb.append("  },\n};\n");
        return sb.toString();
    }

    private static String rustProcessor(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("struct ").append(name).append(";\n");
        sb.append("impl StateProcessor<S> for ").append(name).append(" {\n");
        sb.append("    fn name(&self) -> &str { \"").append(name).append("\" }\n");
        sb.append("    fn requires(&self) -> Vec<TypeId> { requires![");
        sb.append(String.join(", ", reqs));
        sb.append("] }\n");
        sb.append("    fn produces(&self) -> Vec<TypeId> { requires![");
        sb.append(String.join(", ", prods));
        sb.append("] }\n");
        sb.append("    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {\n");
        for (var r : reqs) sb.append("        let ").append(toSnakeCase(r)).append(" = ctx.get::<").append(r).append(">()?;\n");
        sb.append("        // TODO: implement business logic\n");
        for (var p : prods) sb.append("        // ctx.put(").append(p).append(" { ... });\n");
        sb.append("        todo!()\n");
        sb.append("    }\n}\n");
        return sb.toString();
    }

    private static String javaGuard(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("static final TransitionGuard ").append(toConstName(name)).append(" = new TransitionGuard() {\n");
        sb.append("    @Override public String name() { return \"").append(name).append("\"; }\n");
        sb.append("    @Override public Set<Class<?>> requires() { return Set.of(");
        sb.append(String.join(", ", reqs.stream().map(r -> r + ".class").toList()));
        sb.append("); }\n");
        sb.append("    @Override public Set<Class<?>> produces() { return Set.of(");
        sb.append(String.join(", ", prods.stream().map(p -> p + ".class").toList()));
        sb.append("); }\n");
        sb.append("    @Override public int maxRetries() { return 3; }\n");
        sb.append("    @Override public GuardOutput validate(FlowContext ctx) {\n");
        sb.append("        // TODO: implement validation logic\n");
        sb.append("        return new GuardOutput.Accepted();\n");
        sb.append("    }\n};\n");
        return sb.toString();
    }

    private static String tsGuard(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("const ").append(toLowerCamel(name)).append(": TransitionGuard<S> = {\n");
        sb.append("  name: '").append(name).append("',\n");
        sb.append("  requires: [").append(String.join(", ", reqs)).append("],\n");
        sb.append("  produces: [").append(String.join(", ", prods)).append("],\n");
        sb.append("  maxRetries: 3,\n");
        sb.append("  validate(ctx: FlowContext): GuardOutput {\n");
        sb.append("    // TODO: implement validation\n");
        sb.append("    return { type: 'accepted' };\n");
        sb.append("  },\n};\n");
        return sb.toString();
    }

    private static String rustGuard(String name, List<String> reqs, List<String> prods) {
        var sb = new StringBuilder();
        sb.append("struct ").append(name).append(";\n");
        sb.append("impl TransitionGuard<S> for ").append(name).append(" {\n");
        sb.append("    fn name(&self) -> &str { \"").append(name).append("\" }\n");
        sb.append("    fn requires(&self) -> Vec<TypeId> { requires![").append(String.join(", ", reqs)).append("] }\n");
        sb.append("    fn produces(&self) -> Vec<TypeId> { requires![").append(String.join(", ", prods)).append("] }\n");
        sb.append("    fn validate(&self, ctx: &FlowContext) -> GuardOutput {\n");
        sb.append("        // TODO: implement validation\n");
        sb.append("        GuardOutput::Accepted { data: HashMap::new() }\n");
        sb.append("    }\n}\n");
        return sb.toString();
    }

    private static String toConstName(String name) {
        return name.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase();
    }

    private static String toLowerCamel(String name) {
        return Character.toLowerCase(name.charAt(0)) + name.substring(1);
    }

    private static String toSnakeCase(String name) {
        return name.replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase();
    }
}
