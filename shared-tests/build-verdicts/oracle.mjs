// Independent finite-set analysis, based on the paper's all-path guarantee.
export function edges(c) {
  return c.transitions.flatMap((t, i) => t.kind === 'branch'
    ? t.targets.map((target, j) => ({ ...target, kind: t.kind, from: t.from, branch: t.branch, name: `e${i}b${j}`, branchName: `e${i}` }))
    : [{ ...t, name: `e${i}` }]);
}
export function verdict(c) {
  const errors = new Map();
  const add = (code, locus) => errors.set(`${code}|${locus}`, [code, locus]);
  const ts = edges(c);
  const routes = [...c.onError, ...c.onStepError];
  const initial = c.states.find(s => s.initial)?.name;
  const terminals = new Set(c.states.filter(s => s.terminal).map(s => s.name));
  const walk = (start, es) => {
    const seen = new Set([start]), todo = [start];
    while (todo.length) {
      const s = todo.pop();
      for (const e of es.filter(e => e.from === s)) if (!seen.has(e.to)) { seen.add(e.to); todo.push(e.to); }
    }
    return seen;
  };
  if (!initial) add('NO_INITIAL_STATE', 'flow');
  else {
    const seen = walk(initial, [...ts, ...routes]);
    if (!c.allowUnreachable) for (const s of c.states) if (!s.terminal && !seen.has(s.name)) add('UNREACHABLE_STATE', s.name);
    if (!c.allowPerpetual && ![...terminals].some(s => seen.has(s))) add('NO_PATH_TO_TERMINAL', initial);
  }
  const autos = ts.filter(t => t.kind !== 'external');
  if (autos.some(e => walk(e.to, autos).has(e.from))) add('DAG_CYCLE', 'flow');
  for (const s of c.states) {
    const outgoing = ts.filter(t => t.from === s.name), ext = outgoing.filter(t => t.kind === 'external');
    if (ext.length && outgoing.some(t => t.kind !== 'external')) add('AUTO_EXTERNAL_CONFLICT', s.name);
    if (s.terminal) for (const t of outgoing) add('TERMINAL_OUTGOING', `${t.from}->${t.to}`);
    const sets = ext.map(t => [...t.guard.requires].sort().join(','));
    if (new Set(sets).size !== sets.length) add('EXTERNAL_REQUIRES_NOT_DISTINCT', s.name);
  }
  if (initial) {
    const union = (a, b = []) => new Set([...a, ...b]);
    // Discover reachable transfer edges first, then converge by intersections.
    // Undefined is unreachable; empty is reachable with no guaranteed types.
    const available = new Map([[initial, new Set(c.initiallyAvailable)]]);
    let changed = true;
    const merge = (s, incoming) => {
      const old = available.get(s);
      const next = old ? new Set([...old].filter(t => incoming.has(t))) : new Set(incoming);
      if (!old || old.size !== next.size) { available.set(s, next); changed = true; }
    };
    while (changed) {
      changed = false;
      for (const t of ts) {
        const before = available.get(t.from);
        if (!before) continue;
        let after = t.kind === 'external' ? union(before, c.externallyProvided) : new Set(before);
        after = union(after, t.guard?.produces);
        merge(t.to, union(after, t.processor?.produces));
      }
      // Error handlers can run after processor/branch failure or guard exhaustion.
      // The runtime rolls back guard data; no transition-local data is guaranteed.
      for (const r of routes) {
        const before = available.get(r.from);
        if (before && !terminals.has(r.from) && ts.some(t => t.from === r.from)) merge(r.to, before);
      }
    }
    for (const t of ts) {
      const before = available.get(t.from);
      if (!before) continue;
      let a = t.kind === 'external' ? union(before, c.externallyProvided) : new Set(before);
      const check = (contract, locus) => { if (contract?.requires.some(r => !a.has(r))) add('MISSING_REQUIRES', locus); };
      check(t.guard, `guard:${t.name}@${t.from}`);
      a = union(a, t.guard?.produces);
      check(t.branch, `branch:${t.branchName}@${t.from}`);
      check(t.processor, `processor:${t.name}@${t.from}->${t.to}`);
    }
  }
  const sorted = [...errors.values()].sort((a, b) => (`${a[0]}|${a[1]}` < `${b[0]}|${b[1]}` ? -1 : 1));
  return { ok: sorted.length === 0, errors: sorted };
}
