import { describe, it, expect } from 'vitest';
import { Tramli, InMemoryFlowStore, flowKey, MermaidGenerator } from '@unlaxer/tramli';
import type { StateProcessor, TransitionGuard, StateConfig, GuardOutput, FlowKey } from '@unlaxer/tramli';
import type { FlowContext } from '@unlaxer/tramli';
import {
  PluginRegistry, PluginReport,
  // Audit
  AuditStorePlugin, AuditingFlowStore,
  // EventStore
  EventLogStorePlugin, EventLogStoreDecorator,
  ReplayService, ProjectionReplayService, CompensationService,
  // Observability
  ObservabilityEnginePlugin, InMemoryTelemetrySink,
  // Resume
  RichResumeExecutor, RichResumeRuntimePlugin,
  // Idempotency
  InMemoryIdempotencyRegistry, IdempotencyRuntimePlugin, IdempotentRichResumeExecutor,
  // Diagram
  DiagramPlugin, DiagramGenerationPlugin,
  // Docs
  DocumentationPlugin, FlowDocumentationPlugin,
  // Lint
  PolicyLintPlugin,
  // Testing
  ScenarioTestPlugin, ScenarioGenerationPlugin,
  // Hierarchy
  EntryExitCompiler, HierarchyCodeGenerator, HierarchyGenerationPlugin,
  stateSpec, flowSpec, transitionSpec,
  // SubFlow
  GuaranteedSubflowValidator,
} from '../src/index.js';

// ─── Shared test flow ─────────────────────────────

type S = 'CREATED' | 'PENDING' | 'CONFIRMED' | 'DONE' | 'ERROR';

const config: Record<S, StateConfig> = {
  CREATED:   { terminal: false, initial: true },
  PENDING:   { terminal: false },
  CONFIRMED: { terminal: false },
  DONE:      { terminal: true },
  ERROR:     { terminal: true },
};

interface Input { value: string }
interface Middle { processed: boolean }
interface Output { result: string }

const InputKey = flowKey<Input>('Input');
const MiddleKey = flowKey<Middle>('Middle');
const OutputKey = flowKey<Output>('Output');

const proc1: StateProcessor<S> = {
  name: 'Proc1',
  requires: [InputKey],
  produces: [MiddleKey],
  process(ctx: FlowContext) {
    const input = ctx.get(InputKey);
    ctx.put(MiddleKey, { processed: true });
  },
};

const proc2: StateProcessor<S> = {
  name: 'Proc2',
  requires: [MiddleKey],
  produces: [OutputKey],
  process(ctx: FlowContext) {
    ctx.put(OutputKey, { result: 'done' });
  },
};

function testGuard(accept: boolean): TransitionGuard<S> {
  return {
    name: 'TestGuard',
    requires: [MiddleKey],
    produces: [],
    maxRetries: 3,
    validate(_ctx: FlowContext): GuardOutput {
      return accept
        ? { type: 'accepted' }
        : { type: 'rejected', reason: 'declined' };
    },
  };
}

function buildDef(accept = true) {
  return Tramli.define<S>('test', config)
    .setTtl(5 * 60 * 1000)
    .initiallyAvailable(InputKey)
    .from('CREATED').auto('PENDING', proc1)
    .from('PENDING').external('CONFIRMED', testGuard(accept))
    .from('CONFIRMED').auto('DONE', proc2)
    .onAnyError('ERROR')
    .build();
}

// ─── Tests ────────────────────────────────────────

describe('Plugin Integration', () => {

  it('plugin registry lifecycle', () => {
    const registry = new PluginRegistry<S>();
    const sink = new InMemoryTelemetrySink();
    registry
      .register(PolicyLintPlugin.defaults<S>())
      .register(new AuditStorePlugin())
      .register(new EventLogStorePlugin())
      .register(new ObservabilityEnginePlugin(sink));

    const def = buildDef();
    const report = registry.analyzeAll(def);
    expect(report.findings().length).toBeGreaterThanOrEqual(0);

    const store = new InMemoryFlowStore();
    const wrapped = registry.applyStorePlugins(store);
    expect(wrapped).toBeDefined();

    const engine = Tramli.engine(wrapped);
    registry.installEnginePlugins(engine);
  });

  it('store plugin wrapping', () => {
    const store = new InMemoryFlowStore();
    const audit = new AuditStorePlugin();
    const wrapped = audit.wrapStore(store);
    expect(wrapped).toBeInstanceOf(AuditingFlowStore);
  });

  it('audit store captures transitions', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const auditStore = new AuditingFlowStore(store);
    const engine = Tramli.engine(auditStore as any);

    await engine.startFlow(def, 's1',
      new Map([[InputKey as string, { value: 'test' }]]));

    expect(auditStore.auditedTransitions.length).toBeGreaterThanOrEqual(1);
    expect(auditStore.auditedTransitions[0].from).toBe('CREATED');
    expect(auditStore.auditedTransitions[0].to).toBe('PENDING');
  });

  it('engine plugin — observability installs loggers', () => {
    const store = new InMemoryFlowStore();
    const sink = new InMemoryTelemetrySink();
    const engine = Tramli.engine(store);
    const plugin = new ObservabilityEnginePlugin(sink);

    // Verify plugin installs without error
    plugin.install(engine);
    expect(plugin.descriptor().id).toBe('observability');
    expect(plugin.kind()).toBe('ENGINE');
  });

  it('rich resume classification', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const executor = new RichResumeExecutor(engine);

    const flow = await engine.startFlow(def, 's1',
      new Map([[InputKey as string, { value: 'test' }]]));

    const result = await executor.resume(
      flow.id, def, new Map(), 'PENDING',
    );
    expect(result.status).toBe('TRANSITIONED');
  });

  it('eventstore replay', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const eventStore = new EventLogStoreDecorator(store);
    const engine = Tramli.engine(eventStore as any);

    const flow = await engine.startFlow(def, 's1',
      new Map([[InputKey as string, { value: 'test' }]]));

    const events = eventStore.eventsForFlow(flow.id);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const replay = new ReplayService();
    const stateAtV1 = replay.stateAtVersion(eventStore.events(), flow.id, 1);
    expect(stateAtV1).toBe('PENDING');
  });

  it('projection replay', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const eventStore = new EventLogStoreDecorator(store);
    const engine = Tramli.engine(eventStore as any);

    const flow = await engine.startFlow(def, 's1',
      new Map([[InputKey as string, { value: 'test' }]]));
    await engine.resumeAndExecute(flow.id, def);

    const projReplay = new ProjectionReplayService();
    const count = projReplay.stateAtVersion(
      eventStore.events(), flow.id, 999,
      {
        initialState: () => 0,
        apply: (state, event) => state + 1,
      },
    );
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('compensation service', () => {
    const store = new InMemoryFlowStore();
    const eventStore = new EventLogStoreDecorator(store);
    const compensation = new CompensationService(
      (event, cause) => ({ action: 'ROLLBACK', metadata: { reason: cause.message } }),
      eventStore,
    );

    const event = {
      flowId: 'f1', version: 1, type: 'TRANSITION' as const,
      from: 'A', to: 'B', trigger: 'proc',
      timestamp: new Date(), stateSnapshot: '{}',
    };
    const result = compensation.compensate(event, new Error('fail'));
    expect(result).toBe(true);

    const events = eventStore.eventsForFlow('f1');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('COMPENSATION');
  });

  it('diagram generation', () => {
    const def = buildDef(true);
    const plugin = new DiagramPlugin();
    const bundle = plugin.generate(def);
    expect(bundle.mermaid).toContain('stateDiagram-v2');
    expect(bundle.dataFlowJson).toContain('Input');
    expect(bundle.markdownSummary).toContain('# test');
  });

  it('documentation generation', () => {
    const def = buildDef(true);
    const plugin = new DocumentationPlugin();
    const md = plugin.toMarkdown(def);
    expect(md).toContain('# Flow Catalog: test');
    expect(md).toContain('CREATED');
    expect(md).toContain('DONE');
    expect(md).toContain('(initial)');
    expect(md).toContain('(terminal)');
  });

  it('scenario generation', () => {
    const def = buildDef(true);
    const plugin = new ScenarioTestPlugin();
    const plan = plugin.generate(def);
    expect(plan.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(plan.scenarios[0].steps[0]).toContain('given flow in');
  });

  it('lint analysis', () => {
    const def = buildDef(true);
    const lintPlugin = PolicyLintPlugin.defaults<S>();
    const report = new PluginReport();
    lintPlugin.analyze(def, report);
    // OutputKey is dead data (produced but never consumed)
    const findings = report.findings();
    const deadFinding = findings.find(f => f.message.includes('never consumed'));
    expect(deadFinding).toBeDefined();
  });

  it('idempotency duplicate suppression', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const registry = new InMemoryIdempotencyRegistry();
    const executor = new IdempotentRichResumeExecutor(engine, registry);

    const flow = await engine.startFlow(def, 's1',
      new Map([[InputKey as string, { value: 'test' }]]));

    const r1 = await executor.resume(flow.id, def,
      { commandId: 'cmd-1', externalData: new Map() }, 'PENDING');
    expect(r1.status).toBe('TRANSITIONED');

    const r2 = await executor.resume(flow.id, def,
      { commandId: 'cmd-1', externalData: new Map() }, 'CONFIRMED');
    expect(r2.status).toBe('ALREADY_COMPLETE');
  });

  it('hierarchy entry-exit compiler', () => {
    const spec = flowSpec('OrderHierarchy', 'OrderHState');
    const parent = stateSpec('PROCESSING', { initial: true });
    parent.entryProduces.push('AuditLog');
    parent.exitProduces.push('CleanupLog');
    const child = stateSpec('VALIDATING');
    parent.children.push(child);
    spec.rootStates.push(parent);
    spec.transitions.push(transitionSpec('PROCESSING', 'DONE', 'complete'));

    const compiler = new EntryExitCompiler();
    const synth = compiler.synthesize(spec);
    expect(synth.length).toBeGreaterThanOrEqual(2);
    expect(synth.find(t => t.trigger.includes('__entry__'))).toBeDefined();
    expect(synth.find(t => t.trigger.includes('__exit__'))).toBeDefined();
  });

  it('hierarchy code generation', () => {
    const spec = flowSpec('Simple', 'SimpleState');
    spec.rootStates.push(stateSpec('A', { initial: true }));
    spec.rootStates.push(stateSpec('B', { terminal: true }));
    spec.transitions.push(transitionSpec('A', 'B', 'go'));

    const gen = new HierarchyCodeGenerator();
    const stateConfigSrc = gen.generateStateConfig(spec);
    expect(stateConfigSrc).toContain('A');
    expect(stateConfigSrc).toContain('terminal: true');

    const skeleton = gen.generateBuilderSkeleton(spec);
    expect(skeleton).toContain("Tramli.define('Simple'");
    expect(skeleton).toContain('go');
  });

  it('hierarchy generation plugin', () => {
    const spec = flowSpec('TestFlow', 'TestState');
    spec.rootStates.push(stateSpec('INIT', { initial: true }));
    spec.rootStates.push(stateSpec('END', { terminal: true }));

    const plugin = new HierarchyGenerationPlugin();
    const files = plugin.generate(spec);
    expect(files.get('TestState.ts')).toBeDefined();
    expect(files.get('TestFlowGenerated.ts')).toBeDefined();
  });

  it('diagram generation plugin via registry', () => {
    const def = buildDef(true);
    const plugin = new DiagramGenerationPlugin<S>();
    expect(plugin.descriptor().id).toBe('diagram');
    const bundle = plugin.generate(def);
    expect(bundle.mermaid).toContain('stateDiagram-v2');
  });

  it('flow documentation plugin via registry', () => {
    const def = buildDef(true);
    const plugin = new FlowDocumentationPlugin<S>();
    expect(plugin.descriptor().id).toBe('docs');
    const md = plugin.generate(def);
    expect(md).toContain('Flow Catalog');
  });

  it('scenario generation plugin via registry', () => {
    const def = buildDef(true);
    const plugin = new ScenarioGenerationPlugin<S>();
    expect(plugin.descriptor().id).toBe('scenario-tests');
    const plan = plugin.generate(def);
    expect(plan.scenarios.length).toBeGreaterThan(0);
  });

  it('subflow validator', () => {
    const parentDef = buildDef(true);
    const subConfig: Record<'SUB_A' | 'SUB_B', StateConfig> = {
      SUB_A: { terminal: false, initial: true },
      SUB_B: { terminal: true },
    };
    const subDef = Tramli.define<'SUB_A' | 'SUB_B'>('sub', subConfig)
      .from('SUB_A').auto('SUB_B', {
        name: 'SubProc', requires: [], produces: [],
        process() {},
      })
      .build();

    const validator = new GuaranteedSubflowValidator();
    // Should not throw — sub has no data requirements
    expect(() => validator.validate(parentDef, 'PENDING', subDef, new Set())).not.toThrow();
  });

  it('validator semantics unchanged with plugins', () => {
    const def = buildDef(true);

    // Capture without plugins
    const warningsWithout = def.warnings;
    const mermaidWithout = MermaidGenerator.generate(def);

    // Register all plugin types
    const registry = new PluginRegistry<S>();
    registry
      .register(PolicyLintPlugin.defaults<S>())
      .register(new AuditStorePlugin())
      .register(new EventLogStorePlugin())
      .register(new ObservabilityEnginePlugin(new InMemoryTelemetrySink()));

    // Definition is immutable — plugins do not change validation
    expect(def.warnings).toEqual(warningsWithout);
    expect(MermaidGenerator.generate(def)).toBe(mermaidWithout);

    // analyzeAll returns findings but does not mutate definition
    const report = registry.analyzeAll(def);
    expect(report.findings().length).toBeGreaterThanOrEqual(0);
    expect(def.warnings).toEqual(warningsWithout);
  });

  it('runtime adapter plugin binding', async () => {
    const def = buildDef(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);

    const registry = new PluginRegistry<S>();
    registry.register(new RichResumeRuntimePlugin());
    registry.register(new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()));

    const adapters = registry.bindRuntimeAdapters(engine);
    expect(adapters.has('rich-resume')).toBe(true);
    expect(adapters.has('idempotency')).toBe(true);
  });
});
