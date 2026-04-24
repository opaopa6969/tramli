/**
 * Shared test scenarios matching shared-tests/scenarios/*.yaml.
 * These tests must pass identically in Java, TypeScript, and Rust.
 */
import { describe, it, expect } from 'vitest';
import { Tramli } from '../src/tramli.js';
import { InMemoryFlowStore } from '../src/in-memory-flow-store.js';
import { flowKey } from '../src/flow-key.js';
import type { StateConfig, StateProcessor, TransitionGuard, GuardOutput } from '../src/types.js';
import type { FlowContext } from '../src/flow-context.js';

// ─── Shared types ──────────────────────────────────
type TwoStep = 'INIT' | 'DONE' | 'ERROR';
const twoStepConfig: Record<TwoStep, StateConfig> = {
  INIT: { terminal: false, initial: true },
  DONE: { terminal: true },
  ERROR: { terminal: true },
};

const Input = flowKey<{ value: string }>('Input');
const Middle = flowKey<{ value: string }>('Middle');

function ok(name: string, reqs: any[], prods: any[]): StateProcessor<any> {
  return {
    name, requires: reqs, produces: prods,
    process(ctx: FlowContext) {
      for (const p of prods) ctx.put(p, { value: name });
    },
  };
}

// ─── Order flow types (shared by order-happy-path and order-payment-rejected) ─

type OrderState = 'CREATED' | 'PAYMENT_PENDING' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'CANCELLED';
const orderStateConfig: Record<OrderState, StateConfig> = {
  CREATED:           { terminal: false, initial: true },
  PAYMENT_PENDING:   { terminal: false },
  PAYMENT_CONFIRMED: { terminal: false },
  SHIPPED:           { terminal: true },
  CANCELLED:         { terminal: true },
};

interface OrderRequest { itemId: string; quantity: number }
interface PaymentIntent { transactionId: string }
interface PaymentResult { status: string }
interface ShipmentInfo { trackingId: string }

const OrderRequest = flowKey<OrderRequest>('OrderRequest');
const PaymentIntent = flowKey<PaymentIntent>('PaymentIntent');
const PaymentResult = flowKey<PaymentResult>('PaymentResult');
const ShipmentInfo = flowKey<ShipmentInfo>('ShipmentInfo');

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

function makePaymentGuard(accept: boolean): TransitionGuard<OrderState> {
  return {
    name: 'PaymentGuard',
    requires: [PaymentIntent],
    produces: [PaymentResult],
    maxRetries: 3,
    validate(): GuardOutput {
      if (accept) {
        return { type: 'accepted', data: new Map([[PaymentResult as string, { status: 'OK' }]]) };
      }
      return { type: 'rejected', reason: 'Payment declined' };
    },
  };
}

function orderDefinition(acceptPayment: boolean) {
  return Tramli.define<OrderState>('order', orderStateConfig)
    .setTtl(24 * 60 * 60 * 1000)
    .setMaxGuardRetries(3)
    .initiallyAvailable(OrderRequest)
    .from('CREATED').auto('PAYMENT_PENDING', orderInit)
    .from('PAYMENT_PENDING').external('PAYMENT_CONFIRMED', makePaymentGuard(acceptPayment))
    .from('PAYMENT_CONFIRMED').auto('SHIPPED', ship)
    .onAnyError('CANCELLED')
    .build();
}

describe('Shared Scenarios', () => {
  // ─── order-happy-path.yaml ───────────────────────
  it('order happy path', async () => {
    const def = orderDefinition(true);
    const engine = Tramli.engine(new InMemoryFlowStore());

    // Step 1: start → expect PAYMENT_PENDING, PaymentIntent.transactionId = "txn-item-1"
    const flow = await engine.startFlow(def, 'session-happy',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 3 }]]));
    expect(flow.currentState).toBe('PAYMENT_PENDING');
    const intent = flow.context.find(PaymentIntent);
    expect(intent).toBeDefined();
    expect(intent!.transactionId).toBe('txn-item-1');

    // Step 2: resume → expect SHIPPED, completed, ShipmentInfo.trackingId = "TRACK-001"
    const resumed = await engine.resumeAndExecute(flow.id, def);
    expect(resumed.currentState).toBe('SHIPPED');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.exitState).toBe('SHIPPED');
    const shipment = resumed.context.find(ShipmentInfo);
    expect(shipment).toBeDefined();
    expect(shipment!.trackingId).toBe('TRACK-001');
  });

  // ─── order-payment-rejected.yaml ────────────────
  it('order payment rejected', async () => {
    const def = orderDefinition(false);
    const engine = Tramli.engine(new InMemoryFlowStore());

    // Start: PaymentGuard.reject behavior active
    const flow = await engine.startFlow(def, 'session-reject',
      new Map([[OrderRequest as string, { itemId: 'item-1', quantity: 1 }]]));
    expect(flow.currentState).toBe('PAYMENT_PENDING');

    // Resume 1: still PAYMENT_PENDING, guardFailureCount = 1
    const r1 = await engine.resumeAndExecute(flow.id, def);
    expect(r1.currentState).toBe('PAYMENT_PENDING');
    expect(r1.guardFailureCount).toBe(1);

    // Resume 2: still PAYMENT_PENDING, guardFailureCount = 2
    const r2 = await engine.resumeAndExecute(flow.id, def);
    expect(r2.currentState).toBe('PAYMENT_PENDING');
    expect(r2.guardFailureCount).toBe(2);

    // Resume 3: CANCELLED (max retries exceeded), completed
    const r3 = await engine.resumeAndExecute(flow.id, def);
    expect(r3.currentState).toBe('CANCELLED');
    expect(r3.isCompleted).toBe(true);
    expect(r3.exitState).toBe('CANCELLED');
  });

  // ─── subflow-basic.yaml ─────────────────────────
  it('subflow basic', async () => {
    type SubStep = 'S_INIT' | 'S_PROCESS' | 'S_DONE';
    const subConfig: Record<SubStep, StateConfig> = {
      S_INIT: { terminal: false, initial: true },
      S_PROCESS: { terminal: false },
      S_DONE: { terminal: true },
    };
    const SubOutput = flowKey<{ value: string }>('SubOutput');

    const subDef = Tramli.define<SubStep>('sub', subConfig)
      .initiallyAvailable(Input)
      .from('S_INIT').auto('S_PROCESS', ok('SubP1', [Input], [SubOutput]))
      .from('S_PROCESS').auto('S_DONE', ok('SubP2', [SubOutput], []))
      .build();

    const mainDef = Tramli.define<TwoStep>('main', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').subFlow(subDef).onExit('S_DONE', 'DONE').endSubFlow()
      .onAnyError('ERROR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore());
    const flow = await engine.startFlow(mainDef, 's1', new Map([[Input as string, { value: 'x' }]]));
    expect(flow.currentState).toBe('DONE');
    expect(flow.isCompleted).toBe(true);
  });

  // ─── subflow-external.yaml ──────────────────────
  it('subflow external', async () => {
    type SubStep = 'S_INIT' | 'S_WAIT' | 'S_DONE';
    const subConfig: Record<SubStep, StateConfig> = {
      S_INIT: { terminal: false, initial: true },
      S_WAIT: { terminal: false },
      S_DONE: { terminal: true },
    };
    const SubOutput = flowKey<{ value: string }>('SubOutput');

    const subGuard: TransitionGuard<SubStep> = {
      name: 'SubGuard',
      requires: [SubOutput],
      produces: [],
      maxRetries: 3,
      validate(): GuardOutput { return { type: 'accepted' }; },
    };

    const subDef = Tramli.define<SubStep>('sub-ext', subConfig)
      .initiallyAvailable(Input)
      .from('S_INIT').auto('S_WAIT', ok('SubP1', [Input], [SubOutput]))
      .from('S_WAIT').external('S_DONE', subGuard)
      .build();

    const mainDef = Tramli.define<TwoStep>('main-with-subflow-external', twoStepConfig)
      .initiallyAvailable(Input)
      .from('INIT').subFlow(subDef).onExit('S_DONE', 'DONE').endSubFlow()
      .onAnyError('ERROR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore());
    const flow = await engine.startFlow(mainDef, 'session-subext',
      new Map([[Input as string, { value: 'x' }]]));

    // Step 1: expect INIT, activeSubFlow is active
    expect(flow.currentState).toBe('INIT');
    expect(flow.activeSubFlow).not.toBeNull();

    // Step 2: resume → expect DONE, completed, no active subflow
    const resumed = await engine.resumeAndExecute(flow.id, mainDef);
    expect(resumed.currentState).toBe('DONE');
    expect(resumed.isCompleted).toBe(true);
    expect(resumed.activeSubFlow).toBeNull();
  });

  // ─── strictMode test ────────────────────────────
  it('strictMode detects produces violation', async () => {
    const badProducer: StateProcessor<TwoStep> = {
      name: 'BadProducer',
      requires: [],
      produces: [Input], // declares produces but does NOT put
      process(_ctx: FlowContext) { /* intentionally empty */ },
    };

    const def = Tramli.define<TwoStep>('strict-test', twoStepConfig)
      .from('INIT').auto('DONE', badProducer)
      .onAnyError('ERROR')
      .build();

    const engine = Tramli.engine(new InMemoryFlowStore(), { strictMode: true });
    const flow = await engine.startFlow(def, 's1', new Map());
    expect(flow.currentState).toBe('ERROR');
  });
});
