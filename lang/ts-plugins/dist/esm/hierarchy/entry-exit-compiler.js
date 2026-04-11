/**
 * Synthesizes entry/exit transitions from hierarchical state specs.
 */
export class EntryExitCompiler {
    synthesize(spec) {
        const generated = [];
        for (const state of spec.rootStates) {
            this.walk(state, generated, null);
        }
        return generated;
    }
    walk(state, out, parentName) {
        if (state.entryProduces.length > 0) {
            out.push({
                from: parentName ?? `${state.name}__ENTRY_START`,
                to: state.name,
                trigger: `__entry__${state.name}`,
                requires: [],
                produces: [...state.entryProduces],
            });
        }
        if (state.exitProduces.length > 0) {
            out.push({
                from: state.name,
                to: `${state.name}__EXIT_END`,
                trigger: `__exit__${state.name}`,
                requires: [],
                produces: [...state.exitProduces],
            });
        }
        for (const child of state.children) {
            this.walk(child, out, state.name);
        }
    }
}
