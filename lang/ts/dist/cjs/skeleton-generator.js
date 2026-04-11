"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkeletonGenerator = void 0;
/**
 * Generates Processor skeleton code from a FlowDefinition's requires/produces contracts.
 */
class SkeletonGenerator {
    static generate(def, lang) {
        const lines = [
            `// Skeleton generated from flow: ${def.name}`,
            `// Language: ${lang}`,
            '',
        ];
        const seen = new Set();
        for (const t of def.transitions) {
            if (t.processor && !seen.has(t.processor.name)) {
                seen.add(t.processor.name);
                lines.push(this.genProcessor(t.processor.name, t.processor.requires, t.processor.produces, lang));
            }
            if (t.guard && !seen.has(t.guard.name)) {
                seen.add(t.guard.name);
                lines.push(this.genGuard(t.guard.name, t.guard.requires, t.guard.produces, lang));
            }
        }
        return lines.join('\n');
    }
    static genProcessor(name, reqs, prods, lang) {
        if (lang === 'typescript') {
            return `const ${lcFirst(name)}: StateProcessor<S> = {\n  name: '${name}',\n  requires: [${reqs.join(', ')}],\n  produces: [${prods.join(', ')}],\n  process(ctx: FlowContext) {\n${reqs.map(r => `    const ${lcFirst(r)} = ctx.get(${r});`).join('\n')}\n    // TODO: implement\n${prods.map(p => `    // ctx.put(${p}, { ... });`).join('\n')}\n  },\n};\n`;
        }
        if (lang === 'java') {
            return `static final StateProcessor ${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()} = new StateProcessor() {\n    @Override public String name() { return "${name}"; }\n    @Override public Set<Class<?>> requires() { return Set.of(${reqs.map(r => r + '.class').join(', ')}); }\n    @Override public Set<Class<?>> produces() { return Set.of(${prods.map(p => p + '.class').join(', ')}); }\n    @Override public void process(FlowContext ctx) {\n        // TODO: implement\n    }\n};\n`;
        }
        // rust
        return `struct ${name};\nimpl StateProcessor<S> for ${name} {\n    fn name(&self) -> &str { "${name}" }\n    fn requires(&self) -> Vec<TypeId> { requires![${reqs.join(', ')}] }\n    fn produces(&self) -> Vec<TypeId> { requires![${prods.join(', ')}] }\n    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {\n        todo!()\n    }\n}\n`;
    }
    static genGuard(name, reqs, prods, lang) {
        if (lang === 'typescript') {
            return `const ${lcFirst(name)}: TransitionGuard<S> = {\n  name: '${name}',\n  requires: [${reqs.join(', ')}],\n  produces: [${prods.join(', ')}],\n  maxRetries: 3,\n  validate(ctx: FlowContext): GuardOutput {\n    // TODO: implement\n    return { type: 'accepted' };\n  },\n};\n`;
        }
        if (lang === 'java') {
            return `static final TransitionGuard ${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()} = new TransitionGuard() {\n    @Override public String name() { return "${name}"; }\n    @Override public Set<Class<?>> requires() { return Set.of(${reqs.map(r => r + '.class').join(', ')}); }\n    @Override public Set<Class<?>> produces() { return Set.of(${prods.map(p => p + '.class').join(', ')}); }\n    @Override public int maxRetries() { return 3; }\n    @Override public GuardOutput validate(FlowContext ctx) {\n        return new GuardOutput.Accepted();\n    }\n};\n`;
        }
        return `struct ${name};\nimpl TransitionGuard<S> for ${name} {\n    fn name(&self) -> &str { "${name}" }\n    fn requires(&self) -> Vec<TypeId> { requires![${reqs.join(', ')}] }\n    fn produces(&self) -> Vec<TypeId> { requires![${prods.join(', ')}] }\n    fn validate(&self, ctx: &FlowContext) -> GuardOutput {\n        GuardOutput::Accepted { data: HashMap::new() }\n    }\n}\n`;
    }
}
exports.SkeletonGenerator = SkeletonGenerator;
function lcFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
