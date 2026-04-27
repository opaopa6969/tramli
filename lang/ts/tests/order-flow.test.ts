import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { MermaidGenerator } from '../src/mermaid-generator.js';
import { DataFlowGraph } from '../src/data-flow-graph.js';
import { flowKey, type FlowKey } from '../src/flow-key.js';
import type { StateProcessor, TransitionGuard, StateConfig, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── State ──────────────────────��───────────────────

type OrderState = 'CREATED' | 'PAYMENT_PENDING' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'CANCELLED';

const stateConfig: Record<OrderState, StateConfig> = {
  CREATED:           { terminal: false, initial: true },
  PAYMENT_PENDING:   { terminal: false },
  PAYMENT_CONFIRMED: { terminal: false },
  SHIPPED:           { terminal: true },
  CANCELLED:         { terminal: true },
};

// ─── Context data ─────────────────────���─────────────

interface OrderRequest { itemId: string; quantity: number }
interface PaymentIntent { transactionId: string }
interface PaymentResult { status: string }
interface ShipmentInfo { trackingId: string }

const OrderRequest = flowKey<OrderRequest>('OrderRequest');
const PaymentIntent = flowKey<PaymentIntent>('PaymentIntent');
const PaymentResult = flowKey<PaymentResult>('PaymentResult');
const ShipmentInfo = flowKey<ShipmentInfo>('ShipmentInfo');

// ─── Processors ─────────────────────────────────────

const orderInit: StateProcessor<OrderState> = {
  name: 'OrderInit',
  requires: [OrderRequest],
  produces: [PaymentIntent],
  process(ctx: FlowContext) {
    const req = ctx.get(OrderRequest);
    ctx.put(PaymentIntent, { transactionId: `txn-${req.itemId}` });
  },
};

const ship: StateProcessor<OrderState> = {
  name: 'ShipProcessor',
  requires: [PaymentResult],
  produces: [ShipmentInfo],
  process(ctx: FlowContext) {
    ctx.put(ShipmentInfo, { trackingId: 'TRACK-001' });
  },
};

// ─── Guard ──────────────────────��───────────────────

function paymentGuard(accept: boolean): TransitionGuard<OrderState> {
  return {
    name: 'PaymentGuard',
    requires: [PaymentIntent],
    produces: [PaymentResult],
    maxRetries: 3,
    validate(_ctx: FlowContext): GuardOutput {
      if (accept) {
        return {
          type: 'accepted',
          data: new Map([[PaymentResult as string, { status: 'OK' }]]),
        };
      }
      return { type: 'rejected', reason: 'Payment declined' };
    },
  };
}

// ─── Definition ────────────────────────���────────────

function definition(acceptPayment: boolean) {
  return Tramli.define<OrderState>('order', stateConfig)
    .setTtl(24 * 60 * 60 * 1000)
    .setMaxGuardRetries(3)
    .initiallyAvailable(OrderRequest)
    .from('CREATED').auto('PAYMENT_PENDING', orderInit)
    .from('PAYMENT_PENDING').external('PAYMENT_CONFIRMED', paymentGuard(acceptPayment))
    .from('PAYMENT_CONFIRMED').auto('SHIPPED', ship)
    .onAnyError('CANCELLED')
    .build();
}

// ─── Tests ─────────────────────────────��────────────

describe('OrderFlow', () => {
  it('happy path', async () => {
    const def = definition(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);

    const flow = await engine.startFlow(def, 'session-1',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 1 }]]));

    expect(flow.currentState).toBe('PAYMENT_PENDING');
    expect(flow.context.find(PaymentIntent)).toBeDefined();

    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.currentState).toBe('SHIPPED');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.context.find(ShipmentInfo)).toBeDefined();
  });

  it('payment rejected — cancelled after max retries', async () => {
    const def = definition(false);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);

    const flow = await engine.startFlow(def, 'session-1',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 1 }]]));

    await engine.resumeAndExecute(flow.id, def);
    await engine.resumeAndExecute(flow.id, def);
    const final = await engine.resumeAndExecute(flow.id, def);

    expect(final.currentState).toBe('CANCELLED');
    expect(final.isCompleted).toBe(true);
  });

  it('mermaid diagram', () => {
    const def = definition(true);
    const mermaid = MermaidGenerator.generate(def);
    expect(mermaid).toContain('stateDiagram-v2');
    expect(mermaid).toContain('[*] --> CREATED');
    expect(mermaid).toContain('SHIPPED --> [*]');
  });

  it('mermaid diagram excludeErrorTransitions', () => {
    const def = definition(true);
    const withErrors = MermaidGenerator.generate(def);
    const withoutErrors = MermaidGenerator.generate(def, { excludeErrorTransitions: true });
    expect(withErrors).toContain('error');
    expect(withoutErrors).not.toContain('error');
    expect(withoutErrors).toContain('stateDiagram-v2');
    expect(withoutErrors).toContain('[*] --> CREATED');
  });

  it('data-flow graph', () => {
    const def = definition(true);
    const graph = def.dataFlowGraph!;

    // Available data at each state
    expect(graph.availableAt('CREATED').has('OrderRequest')).toBe(true);
    expect(graph.availableAt('PAYMENT_PENDING').has('PaymentIntent')).toBe(true);
    expect(graph.availableAt('SHIPPED').has('ShipmentInfo')).toBe(true);

    // Producers
    expect(graph.producersOf(PaymentIntent).length).toBeGreaterThan(0);
    expect(graph.producersOf(PaymentIntent)[0].name).toBe('OrderInit');

    // Consumers
    expect(graph.consumersOf(OrderRequest).length).toBeGreaterThan(0);
    expect(graph.consumersOf(OrderRequest)[0].name).toBe('OrderInit');

    // Dead data — ShipmentInfo is produced but never required
    expect(graph.deadData().has('ShipmentInfo')).toBe(true);
  });

  it('data-flow mermaid', () => {
    const def = definition(true);
    const mermaid = MermaidGenerator.generateDataFlow(def);
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('OrderInit');
    expect(mermaid).toContain('PaymentIntent');
    expect(mermaid).toContain('produces');
    expect(mermaid).toContain('requires');
  });

  it('data-flow lifetime', () => {
    const def = definition(true);
    const lt = def.dataFlowGraph!.lifetime(PaymentIntent);
    expect(lt).toBeDefined();
    expect(lt!.firstProduced).toBe('PAYMENT_PENDING');
  });

  it('data-flow pruning hints', () => {
    const def = definition(true);
    const hints = def.dataFlowGraph!.pruningHints();
    expect(hints.has('SHIPPED')).toBe(true);
  });

  it('processor compatibility', () => {
    expect(DataFlowGraph.isCompatible(orderInit, orderInit)).toBe(true);
    expect(DataFlowGraph.isCompatible(orderInit, ship)).toBe(false);
  });

  it('assertDataFlow on happy path', async () => {
    const def = definition(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 1 }]]));
    const missing = def.dataFlowGraph!.assertDataFlow(flow.context, flow.currentState);
    expect(missing).toEqual([]);
  });

  // ─── v1.4.0+ API tests ──────────────────────────────

  it('impactOf', () => {
    const def = definition(true);
    const impact = def.dataFlowGraph!.impactOf(PaymentIntent);
    expect(impact.producers.length).toBeGreaterThan(0);
    expect(impact.consumers.length).toBeGreaterThan(0);
  });

  it('parallelismHints', () => {
    const def = definition(true);
    const hints = def.dataFlowGraph!.parallelismHints();
    expect(hints).toBeDefined();
  });

  it('toJson', () => {
    const def = definition(true);
    const json = def.dataFlowGraph!.toJson();
    expect(json).toContain('"types"');
    expect(json).toContain('OrderRequest');
  });

  it('migrationOrder and toMarkdown', () => {
    const def = definition(true);
    const order = def.dataFlowGraph!.migrationOrder();
    expect(order.length).toBeGreaterThan(0);
    expect(order[0]).toBe('OrderInit');

    const md = def.dataFlowGraph!.toMarkdown();
    expect(md).toContain('# Migration Checklist');
    expect(md).toContain('OrderInit');
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('crossFlowMap', () => {
    const def = definition(true);
    const map = DataFlowGraph.crossFlowMap(def.dataFlowGraph!, def.dataFlowGraph!);
    expect(map).toBeDefined();
  });

  it('diff', () => {
    const def = definition(true);
    const result = DataFlowGraph.diff(def.dataFlowGraph!, def.dataFlowGraph!);
    expect(result.addedTypes.size).toBe(0);
    expect(result.removedTypes.size).toBe(0);
  });

  it('versionCompatibility', () => {
    const def = definition(true);
    const issues = DataFlowGraph.versionCompatibility(def.dataFlowGraph!, def.dataFlowGraph!);
    expect(issues).toEqual([]);
  });

  it('skeletonGenerator', async () => {
    const { SkeletonGenerator } = await import('../src/skeleton-generator.js');
    const def = definition(true);
    const ts = SkeletonGenerator.generate(def, 'typescript');
    expect(ts).toContain('OrderInit');
    const java = SkeletonGenerator.generate(def, 'java');
    expect(java).toContain('OrderInit');
    const rust = SkeletonGenerator.generate(def, 'rust');
    expect(rust).toContain('OrderInit');
    expect(rust).toContain('fn produces(&self) -> Vec<TypeId> { produces![');
    expect(rust).not.toMatch(/fn produces\(&self\).*requires!\[/);
  });

  it('generateExternalContract', () => {
    const def = definition(true);
    const mermaid = MermaidGenerator.generateExternalContract(def);
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('PaymentGuard');
  });

  it('availableData and missingFor', async () => {
    const def = definition(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);
    const flow = await engine.startFlow(def, 's1',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 1 }]]));

    expect(flow.availableData().size).toBeGreaterThan(0);
    expect(flow.missingFor().length).toBe(0);
  });

  it('withPlugin', () => {
    const def = definition(true);
    type SubSimple = 'SS_INIT' | 'SS_DONE';
    const ssConfig: Record<SubSimple, import('../src/types.js').StateConfig> = {
      SS_INIT: { terminal: false, initial: true },
      SS_DONE: { terminal: true },
    };
    const pluginDef = Tramli.define<SubSimple>('plugin', ssConfig)
      .from('SS_INIT').auto('SS_DONE', {
        name: 'PluginProc', requires: [], produces: [],
        process() {},
      })
      .build();
    const extended = def.withPlugin('CREATED', 'PAYMENT_PENDING', pluginDef);
    expect(extended).toBeDefined();
    expect(extended.name).toContain('plugin');
  });

  it('transition log', async () => {
    const def = definition(true);
    const store = new InMemoryFlowStore();
    const engine = Tramli.engine(store);

    const flow = await engine.startFlow(def, 's1',
      new Map([[OrderRequest as string, { itemId: 'x', quantity: 1 }]]));
    await engine.resumeAndExecute(flow.id, def);

    const log = store.transitionLog;
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log[0].from).toBe('CREATED');
    expect(log[0].to).toBe('PAYMENT_PENDING');
    expect(log[0].timestamp).toBeInstanceOf(Date);
  });
});
