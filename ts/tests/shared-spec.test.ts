/**
 * Shared test scenarios from docs/specs/shared-test-scenarios.md.
 * Covers S06, S08, S09, S10, S11, S14, S15, S17, S18, S21, S22, S30.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── Shared keys ────────────────────────────────────

const TempData = flowKey<string>('TempData');
const Validated = flowKey<boolean>('Validated');
const Result = flowKey<string>('Result');
const PaymentData = flowKey<string>('PaymentData');
const CancelRequest = flowKey<string>('CancelRequest');
const Receipt = flowKey<string>('Receipt');
const EnteredB = flowKey<boolean>('EnteredB');
const EnteredC = flowKey<boolean>('EnteredC');
const ExitedA = flowKey<boolean>('ExitedA');
const ExitedB = flowKey<boolean>('ExitedB');
const PluginResult = flowKey<string>('PluginResult');

// ─── Helpers ────────────────────────────────────────

function noop<S extends string>(name: string): StateProcessor<S> {
  return { name, requires: [], produces: [], process() {} };
}

// Custom error classes for exception routing tests
class SpecificError extends Error {
  constructor(message = 'specific') { super(message); this.name = 'SpecificError'; }
}
class GenericError extends Error {
  constructor(message = 'generic') { super(message); this.name = 'GenericError'; }
}

// ─── S06: Processor Error with Context Rollback ─────

describe('S06: Processor Error with Context Rollback', () => {
  type S06 = 'A' | 'B' | 'C' | 'ERR';
  const s06Config: Record<S06, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: false },
    ERR: { terminal: true },
  };

  it('s06_processor_error_rollback', async () => {
    const guard: TransitionGuard<S06> = {
      name: 'AcceptGuard',
      requires: [],
      produces: [TempData],
      maxRetries: 3,
      validate(): GuardOutput {
        return { type: 'accepted', data: new Map([[TempData as string, 'temp']]) };
      },
    };

    const failingProcessor: StateProcessor<S06> = {
      name: 'FailProc',
      requires: [TempData],
      produces: [],
      process() { throw new Error('processor failed'); },
    };

    const def = Tramli.define<S06>('s06', s06Config)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guard, failingProcessor)
      .onAnyError('ERR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.currentState).toBe('ERR');
    expect(resumed.isCompleted).toBe(true);
    // Context rolled back: TempData should NOT be present
    expect(resumed.context.find(TempData)).toBeUndefined();
  });
});

// ─── S08: onStateEnter / onStateExit ────────────────

describe('S08: onStateEnter / onStateExit', () => {
  type S08 = 'A' | 'B' | 'C';
  const s08Config: Record<S08, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
  };

  it('s08_enter_exit_actions', async () => {
    const def = Tramli.define<S08>('s08', s08Config)
      .onStateExit('A', (ctx) => ctx.put(ExitedA, true))
      .onStateEnter('B', (ctx) => ctx.put(EnteredB, true))
      .onStateExit('B', (ctx) => ctx.put(ExitedB, true))
      .onStateEnter('C', (ctx) => ctx.put(EnteredC, true))
      .from('A').auto('B', noop('Noop1'))
      .from('B').auto('C', noop('Noop2'))
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());

    expect(flow.currentState).toBe('C');
    expect(flow.isCompleted).toBe(true);
    expect(flow.context.find(ExitedA)).toBe(true);
    expect(flow.context.find(EnteredB)).toBe(true);
    expect(flow.context.find(ExitedB)).toBe(true);
    expect(flow.context.find(EnteredC)).toBe(true);
  });
});

// ─── S09: onStepError Exception Routes ──────────────

describe('S09: onStepError Exception Route', () => {
  type S09 = 'A' | 'B' | 'C' | 'SPECIAL_ERR' | 'GENERIC_ERR';
  const s09Config: Record<S09, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: false },
    SPECIAL_ERR: { terminal: true },
    GENERIC_ERR: { terminal: true },
  };

  it('s09_exception_route_specific', async () => {
    const failSpecific: StateProcessor<S09> = {
      name: 'FailSpecific',
      requires: [],
      produces: [],
      process() { throw new SpecificError(); },
    };

    const def = Tramli.define<S09>('s09-specific', s09Config)
      .from('A').auto('B', noop('Noop'))
      .from('B').auto('C', failSpecific)
      .onStepError('B', SpecificError, 'SPECIAL_ERR')
      .onError('B', 'GENERIC_ERR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());

    expect(flow.currentState).toBe('SPECIAL_ERR');
    expect(flow.isCompleted).toBe(true);
  });

  it('s09_exception_route_fallback', async () => {
    const failGeneric: StateProcessor<S09> = {
      name: 'FailGeneric',
      requires: [],
      produces: [],
      process() { throw new GenericError(); },
    };

    const def = Tramli.define<S09>('s09-fallback', s09Config)
      .from('A').auto('B', noop('Noop'))
      .from('B').auto('C', failGeneric)
      .onStepError('B', SpecificError, 'SPECIAL_ERR')
      .onError('B', 'GENERIC_ERR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());

    expect(flow.currentState).toBe('GENERIC_ERR');
    expect(flow.isCompleted).toBe(true);
  });
});

// ─── S10: Multi-External Guard Selection ────────────

describe('S10: Multi-External Guard Selection', () => {
  type S10 = 'A' | 'B' | 'C' | 'D';
  const s10Config: Record<S10, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
    D: { terminal: true },
  };

  function guardA(): TransitionGuard<S10> {
    return {
      name: 'GuardA',
      requires: [PaymentData],
      produces: [Receipt],
      maxRetries: 3,
      validate(): GuardOutput {
        return { type: 'accepted', data: new Map([[Receipt as string, 'ok']]) };
      },
    };
  }

  function guardB(): TransitionGuard<S10> {
    return {
      name: 'GuardB',
      requires: [CancelRequest],
      produces: [],
      maxRetries: 3,
      validate(): GuardOutput {
        return { type: 'accepted' };
      },
    };
  }

  it('s10_multi_external_payment', async () => {
    const def = Tramli.define<S10>('s10', s10Config)
      .initiallyAvailable(PaymentData, CancelRequest)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guardA())
      .from('B').external('D', guardB())
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    const resumed = await engine.resumeAndExecute(
      flow.id, def,
      new Map([[PaymentData as string, 'card']]),
    );
    expect(resumed.currentState).toBe('C');
    expect(resumed.isCompleted).toBe(true);
  });

  it('s10_multi_external_cancel', async () => {
    const def = Tramli.define<S10>('s10', s10Config)
      .initiallyAvailable(PaymentData, CancelRequest)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guardA())
      .from('B').external('D', guardB())
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    const resumed = await engine.resumeAndExecute(
      flow.id, def,
      new Map([[CancelRequest as string, 'user']]),
    );
    expect(resumed.currentState).toBe('D');
    expect(resumed.isCompleted).toBe(true);
  });
});

// ─── S11: Per-State Timeout ─────────────────────────

describe('S11: Per-State Timeout', () => {
  type S11 = 'A' | 'B' | 'C';
  const s11Config: Record<S11, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
  };

  it('s11_per_state_timeout_expired', async () => {
    const guard: TransitionGuard<S11> = {
      name: 'Guard',
      requires: [],
      produces: [],
      maxRetries: 3,
      validate(): GuardOutput { return { type: 'accepted' }; },
    };

    const def = Tramli.define<S11>('s11', s11Config)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guard, { timeout: 0 })
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    // timeout=0 means already expired
    await new Promise(r => setTimeout(r, 5));

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.exitState).toBe('EXPIRED');
  });
});

// ─── S14: Per-Guard Failure Count ───────────────────

describe('S14: Per-Guard Failure Count', () => {
  type S14 = 'A' | 'B' | 'C' | 'ERR';
  const s14Config: Record<S14, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
    ERR: { terminal: true },
  };

  it('s14_per_guard_count', async () => {
    const guard: TransitionGuard<S14> = {
      name: 'myGuard',
      requires: [],
      produces: [],
      maxRetries: 5,
      validate(): GuardOutput { return { type: 'rejected', reason: 'nope' }; },
    };

    const def = Tramli.define<S14>('s14', s14Config)
      .setMaxGuardRetries(5)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guard)
      .onAnyError('ERR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    const r1 = await engine.resumeAndExecute(flow.id, def);
    expect(r1.guardFailureCount).toBe(1);
    expect(r1.guardFailureCountFor('myGuard')).toBe(1);

    const r2 = await engine.resumeAndExecute(flow.id, def);
    expect(r2.guardFailureCount).toBe(2);
    expect(r2.guardFailureCountFor('myGuard')).toBe(2);
  });
});

// ─── S15: guardFailureCount Reset on State Change ───

describe('S15: guardFailureCount Reset on State Change', () => {
  type S15 = 'A' | 'B' | 'C' | 'D' | 'ERR';
  const s15Config: Record<S15, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: false },
    D: { terminal: true },
    ERR: { terminal: true },
  };

  it('s15_guard_count_reset', async () => {
    let bcCallCount = 0;
    const guardBC: TransitionGuard<S15> = {
      name: 'GuardBC',
      requires: [],
      produces: [],
      maxRetries: 5,
      validate(): GuardOutput {
        bcCallCount++;
        if (bcCallCount === 1) return { type: 'rejected', reason: 'first' };
        return { type: 'accepted' };
      },
    };

    const guardCD: TransitionGuard<S15> = {
      name: 'GuardCD',
      requires: [],
      produces: [],
      maxRetries: 5,
      validate(): GuardOutput { return { type: 'accepted' }; },
    };

    const def = Tramli.define<S15>('s15', s15Config)
      .setMaxGuardRetries(5)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guardBC)
      .from('C').external('D', guardCD)
      .onAnyError('ERR')
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    // First resume: rejected, guardFailureCount = 1
    const r1 = await engine.resumeAndExecute(flow.id, def);
    expect(r1.currentState).toBe('B');
    expect(r1.guardFailureCount).toBe(1);

    // Second resume: accepted, state changes B -> C, guardFailureCount resets to 0
    const r2 = await engine.resumeAndExecute(flow.id, def);
    expect(r2.currentState).toBe('C');
    expect(r2.guardFailureCount).toBe(0);
  });
});

// ─── S17: External with Processor ───────────────────

describe('S17: External with Processor', () => {
  type S17 = 'A' | 'B' | 'C';
  const s17Config: Record<S17, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
  };

  it('s17_external_with_processor', async () => {
    const guard: TransitionGuard<S17> = {
      name: 'AcceptGuard',
      requires: [],
      produces: [Validated],
      maxRetries: 3,
      validate(): GuardOutput {
        return { type: 'accepted', data: new Map([[Validated as string, true]]) };
      },
    };

    const postProcessor: StateProcessor<S17> = {
      name: 'PostProc',
      requires: [Validated],
      produces: [Result],
      process(ctx: FlowContext) {
        ctx.put(Result, 'done');
      },
    };

    const def = Tramli.define<S17>('s17', s17Config)
      .from('A').auto('B', noop('Noop'))
      .from('B').external('C', guard, postProcessor)
      .build();

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('B');

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.currentState).toBe('C');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.context.get(Result)).toBe('done');
  });
});

// ─── S18: allowPerpetual ────────────────────────────

describe('S18: allowPerpetual', () => {
  type S18 = 'A' | 'B';
  const s18Config: Record<S18, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
  };

  const cycleGuard: TransitionGuard<S18> = {
    name: 'CycleGuard',
    requires: [],
    produces: [],
    maxRetries: 3,
    validate(): GuardOutput { return { type: 'accepted' }; },
  };

  it('s18_perpetual_builds_ok', () => {
    const def = Tramli.define<S18>('s18', s18Config)
      .allowPerpetual()
      .from('A').auto('B', noop('Noop'))
      .from('B').external('A', cycleGuard)
      .build();

    expect(def).toBeDefined();
    expect(def.warnings.some(w => w.includes('liveness risk'))).toBe(true);
  });

  it('s18_perpetual_without_flag_fails', () => {
    expect(() =>
      Tramli.define<S18>('s18-fail', s18Config)
        .from('A').auto('B', noop('Noop'))
        .from('B').external('A', cycleGuard)
        .build()
    ).toThrow(/No path/);
  });
});

// ─── S21: withPlugin Basic ──────────────────────────

describe('S21: withPlugin Basic', () => {
  type S21Main = 'CREATED' | 'PAYMENT' | 'DONE';
  const s21MainConfig: Record<S21Main, StateConfig> = {
    CREATED: { terminal: false, initial: true },
    PAYMENT: { terminal: false },
    DONE: { terminal: true },
  };

  type S21Plugin = 'PL_INIT' | 'PL_DONE';
  const s21PluginConfig: Record<S21Plugin, StateConfig> = {
    PL_INIT: { terminal: false, initial: true },
    PL_DONE: { terminal: true },
  };

  it('s21_plugin_inserts_subflow', async () => {
    const pluginProc: StateProcessor<S21Plugin> = {
      name: 'PluginProc',
      requires: [],
      produces: [PluginResult],
      process(ctx: FlowContext) {
        ctx.put(PluginResult, 'validated');
      },
    };

    const mainDef = Tramli.define<S21Main>('s21-main', s21MainConfig)
      .from('CREATED').auto('PAYMENT', noop('InitProc'))
      .from('PAYMENT').auto('DONE', noop('FinalProc'))
      .build();

    const pluginDef = Tramli.define<S21Plugin>('s21-plugin', s21PluginConfig)
      .from('PL_INIT').auto('PL_DONE', pluginProc)
      .build();

    const extended = mainDef.withPlugin('CREATED', 'PAYMENT', pluginDef);

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(extended, 's1', new Map());

    expect(flow.currentState).toBe('DONE');
    expect(flow.isCompleted).toBe(true);
    expect(flow.context.get(PluginResult)).toBe('validated');
  });
});

// ─── S22: withPlugin Preserves Enter/Exit Actions ───

describe('S22: withPlugin Preserves Enter/Exit Actions', () => {
  type S22Main = 'A' | 'B' | 'C';
  const s22MainConfig: Record<S22Main, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
  };

  type S22Plugin = 'PL_A' | 'PL_B';
  const s22PluginConfig: Record<S22Plugin, StateConfig> = {
    PL_A: { terminal: false, initial: true },
    PL_B: { terminal: true },
  };

  it('s22_plugin_preserves_actions', async () => {
    const mainDef = Tramli.define<S22Main>('s22-main', s22MainConfig)
      .onStateExit('A', (ctx) => ctx.put(ExitedA, true))
      .onStateEnter('B', (ctx) => ctx.put(EnteredB, true))
      .from('A').auto('B', noop('Noop1'))
      .from('B').auto('C', noop('Noop2'))
      .build();

    const pluginDef = Tramli.define<S22Plugin>('s22-plugin', s22PluginConfig)
      .from('PL_A').auto('PL_B', noop('PlNoop'))
      .build();

    const extended = mainDef.withPlugin('A', 'B', pluginDef);

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(extended, 's1', new Map());

    expect(flow.context.find(ExitedA)).toBe(true);
    expect(flow.context.find(EnteredB)).toBe(true);
    expect(flow.currentState).toBe('C');
    expect(flow.isCompleted).toBe(true);
  });
});

// ─── S30: withPlugin Name Convention ────────────────

describe('S30: withPlugin Name Convention', () => {
  type S30Main = 'A' | 'B' | 'C';
  const s30MainConfig: Record<S30Main, StateConfig> = {
    A: { terminal: false, initial: true },
    B: { terminal: false },
    C: { terminal: true },
  };

  type S30Plugin = 'PL_A' | 'PL_B';
  const s30PluginConfig: Record<S30Plugin, StateConfig> = {
    PL_A: { terminal: false, initial: true },
    PL_B: { terminal: true },
  };

  it('s30_plugin_name', () => {
    const mainDef = Tramli.define<S30Main>('order', s30MainConfig)
      .from('A').auto('B', noop('Noop1'))
      .from('B').auto('C', noop('Noop2'))
      .build();

    const pluginDef = Tramli.define<S30Plugin>('validation', s30PluginConfig)
      .from('PL_A').auto('PL_B', noop('PlNoop'))
      .build();

    const extended = mainDef.withPlugin('A', 'B', pluginDef);
    expect(extended.name).toBe('order+plugin:validation');
  });
});

// ═══════════════════════════════════════════════════════════════
// S23: withPlugin Preserves Exception Routes
// ═══════════════════════════════════════════════════════════════

describe('S23: withPlugin Preserves Exception Routes', () => {
  class SpecificError extends Error { constructor() { super('specific'); this.name = 'SpecificError'; } }

  type S23 = 'A' | 'B' | 'C' | 'SPECIAL_ERR';
  const s23Config: Record<S23, StateConfig> = {
    A: { initial: true }, B: {}, C: { terminal: true }, SPECIAL_ERR: { terminal: true },
  };

  type S23Pl = 'PL_A' | 'PL_B';
  const s23PlConfig: Record<S23Pl, StateConfig> = {
    PL_A: { initial: true }, PL_B: { terminal: true },
  };

  it('s23_plugin_preserves_exception_routes', async () => {
    const failProc: StateProcessor<S23> = {
      name: 'failProc', requires: [], produces: [],
      process() { throw new SpecificError(); },
    };

    const mainDef = Tramli.define<S23>('s23', s23Config)
      .from('A').auto('B', noop('init'))
      .from('B').auto('C', failProc)
      .onStepError('B', SpecificError, 'SPECIAL_ERR')
      .build();

    const pluginDef = Tramli.define<S23Pl>('plugin', s23PlConfig)
      .from('PL_A').auto('PL_B', noop('plNoop'))
      .build();

    const extended = mainDef.withPlugin('A', 'B', pluginDef);

    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(extended, 's23', new Map());

    expect(flow.currentState).toBe('SPECIAL_ERR');
    expect(flow.isCompleted).toBe(true);
  });
});
