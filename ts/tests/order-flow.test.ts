import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { MermaidGenerator } from '../src/mermaid-generator.js';
import { flowKey, type FlowKey } from '../src/flow-key.js';
import type { StateProcessor, TransitionGuard, StateConfig, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── State ──────────────────────��───────────────────

type OrderState = 'CREATED' | 'PAYMENT_PENDING' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'CANCELLED';

const stateConfig: Record<OrderState, StateConfig> = {
  CREATED:           { terminal: false, initial: true },
  PAYMENT_PENDING:   { terminal: false, initial: false },
  PAYMENT_CONFIRMED: { terminal: false, initial: false },
  SHIPPED:           { terminal: true,  initial: false },
  CANCELLED:         { terminal: true,  initial: false },
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
