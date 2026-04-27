import type { HierarchicalFlowSpec, HierarchicalStateSpec, HierarchicalTransitionSpec } from './types.js';

export class EntryExitCompiler {
  synthesize(spec: HierarchicalFlowSpec): HierarchicalTransitionSpec[] {
    const generated: HierarchicalTransitionSpec[] = [];
    for (const state of spec.rootStates) {
      this.walkEntryExit(state, generated, null);
    }
    return generated;
  }

  compileTransition(spec: HierarchicalFlowSpec, from: string, to: string): HierarchicalTransitionSpec[] {
    const pathFrom = this.pathTo(spec.rootStates, from);
    const pathTo = this.pathTo(spec.rootStates, to);
    if (pathFrom.length === 0 || pathTo.length === 0) return [];

    const lcaIdx = this.lcaIndex(pathFrom, pathTo);
    const result: HierarchicalTransitionSpec[] = [];

    for (let i = pathFrom.length - 1; i > lcaIdx; i--) {
      const state = pathFrom[i];
      if (state.exitProduces.length > 0) {
        result.push({
          from: state.name,
          to: `${state.name}__EXIT_END`,
          trigger: `__exit__${state.name}`,
          requires: [],
          produces: [...state.exitProduces],
        });
      }
    }

    for (let i = lcaIdx + 1; i < pathTo.length; i++) {
      const state = pathTo[i];
      if (state.entryProduces.length > 0) {
        const parentName = pathTo[i - 1].name;
        result.push({
          from: parentName,
          to: state.name,
          trigger: `__entry__${state.name}`,
          requires: [],
          produces: [...state.entryProduces],
        });
      }
    }

    return result;
  }

  synthesizeBubbling(spec: HierarchicalFlowSpec): HierarchicalTransitionSpec[] {
    const handledTriggers = new Map<string, Set<string>>();
    for (const t of spec.transitions) {
      if (!handledTriggers.has(t.from)) handledTriggers.set(t.from, new Set());
      handledTriggers.get(t.from)!.add(t.trigger);
    }

    const bubbled: HierarchicalTransitionSpec[] = [];
    for (const t of spec.transitions) {
      this.propagateBubbling(spec.rootStates, t, handledTriggers, bubbled);
    }
    return bubbled;
  }

  lca(spec: HierarchicalFlowSpec, a: string, b: string): HierarchicalStateSpec | null {
    const pathA = this.pathTo(spec.rootStates, a);
    const pathB = this.pathTo(spec.rootStates, b);
    const idx = this.lcaIndex(pathA, pathB);
    return idx >= 0 ? pathA[idx] : null;
  }

  pathTo(roots: HierarchicalStateSpec[], name: string): HierarchicalStateSpec[] {
    for (const root of roots) {
      const path: HierarchicalStateSpec[] = [];
      if (this.findPath(root, name, path)) return path;
    }
    return [];
  }

  private findPath(node: HierarchicalStateSpec, name: string, path: HierarchicalStateSpec[]): boolean {
    path.push(node);
    if (node.name === name) return true;
    for (const child of node.children) {
      if (this.findPath(child, name, path)) return true;
    }
    path.pop();
    return false;
  }

  private lcaIndex(pathA: HierarchicalStateSpec[], pathB: HierarchicalStateSpec[]): number {
    let lca = -1;
    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i].name === pathB[i].name) {
        lca = i;
      } else {
        break;
      }
    }
    return lca;
  }

  private walkEntryExit(
    state: HierarchicalStateSpec,
    out: HierarchicalTransitionSpec[],
    parentName: string | null,
  ): void {
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
      this.walkEntryExit(child, out, state.name);
    }
  }

  private propagateBubbling(
    roots: HierarchicalStateSpec[],
    parentTransition: HierarchicalTransitionSpec,
    handledTriggers: Map<string, Set<string>>,
    out: HierarchicalTransitionSpec[],
  ): void {
    const fromState = this.findState(roots, parentTransition.from);
    if (!fromState) return;

    for (const child of fromState.children) {
      const childHandles = handledTriggers.get(child.name) ?? new Set();
      if (!childHandles.has(parentTransition.trigger)) {
        const fallback: HierarchicalTransitionSpec = {
          from: child.name,
          to: parentTransition.to,
          trigger: parentTransition.trigger,
          requires: [...parentTransition.requires],
          produces: [...parentTransition.produces],
        };
        out.push(fallback);
        this.propagateBubbling(roots, fallback, handledTriggers, out);
      }
    }
  }

  private findState(roots: HierarchicalStateSpec[], name: string): HierarchicalStateSpec | null {
    for (const root of roots) {
      const found = this.findStateRecursive(root, name);
      if (found) return found;
    }
    return null;
  }

  private findStateRecursive(node: HierarchicalStateSpec, name: string): HierarchicalStateSpec | null {
    if (node.name === name) return node;
    for (const child of node.children) {
      const found = this.findStateRecursive(child, name);
      if (found) return found;
    }
    return null;
  }
}
