package com.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static com.tramli.OrderFlowExample.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Shared test scenarios matching shared-tests/scenarios/*.yaml.
 * These tests must pass identically in Java, TypeScript, and Rust.
 */
class SharedScenarioTest {

    // ─── order-happy-path.yaml ──────────────────────────

    @Test
    void orderHappyPath() {
        var def = definition(true);
        var engine = new FlowEngine(new InMemoryFlowStore());
        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 3));
        var flow = engine.startFlow(def, null, data);

        // Step 1: expect PAYMENT_PENDING, PaymentIntent in context
        assertEquals(OrderState.PAYMENT_PENDING, flow.currentState());
        assertNotNull(flow.context().find(PaymentIntent.class).orElse(null));

        // Step 2: resume → expect SHIPPED, completed
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(OrderState.SHIPPED, flow.currentState());
        assertTrue(flow.isCompleted());
        assertEquals("SHIPPED", flow.exitState());
        assertNotNull(flow.context().find(ShipmentInfo.class).orElse(null));
    }

    // ─── order-payment-rejected.yaml ────────────────────

    @Test
    void orderPaymentRejected() {
        var def = definition(false);
        var engine = new FlowEngine(new InMemoryFlowStore());
        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 1));
        var flow = engine.startFlow(def, null, data);

        assertEquals(OrderState.PAYMENT_PENDING, flow.currentState());

        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(1, flow.guardFailureCount());

        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(2, flow.guardFailureCount());

        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(OrderState.CANCELLED, flow.currentState());
        assertTrue(flow.isCompleted());
        assertEquals("CANCELLED", flow.exitState());
    }

    // ─── subflow-basic.yaml ─────────────────────────────

    @Test
    void subflowBasic() {
        var subDef = Tramli.define("sub", FlowEngineErrorTest.SubStep.class)
                .initiallyAvailable(FlowEngineErrorTest.Input.class)
                .from(FlowEngineErrorTest.SubStep.S_INIT).auto(FlowEngineErrorTest.SubStep.S_PROCESS,
                        FlowEngineErrorTest.ok("SubP1", Set.of(FlowEngineErrorTest.Input.class), Set.of(FlowEngineErrorTest.SubOutput.class)))
                .from(FlowEngineErrorTest.SubStep.S_PROCESS).auto(FlowEngineErrorTest.SubStep.S_DONE,
                        FlowEngineErrorTest.ok("SubP2", Set.of(FlowEngineErrorTest.SubOutput.class), Set.of()))
                .build();

        var mainDef = Tramli.define("main", FlowEngineErrorTest.TwoStep.class)
                .initiallyAvailable(FlowEngineErrorTest.Input.class)
                .from(FlowEngineErrorTest.TwoStep.INIT).subFlow(subDef).onExit("S_DONE", FlowEngineErrorTest.TwoStep.DONE).endSubFlow()
                .onAnyError(FlowEngineErrorTest.TwoStep.ERROR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore());
        var flow = engine.startFlow(mainDef, "s1",
                Map.of(FlowEngineErrorTest.Input.class, new FlowEngineErrorTest.Input("x")));

        assertEquals(FlowEngineErrorTest.TwoStep.DONE, flow.currentState());
        assertTrue(flow.isCompleted());
    }

    // ─── strictMode test ────────────────────────────────

    @Test
    void strictModeDetectsProducesViolation() {
        StateProcessor badProducer = new StateProcessor() {
            @Override public String name() { return "BadProducer"; }
            @Override public Set<Class<?>> requires() { return Set.of(); }
            @Override public Set<Class<?>> produces() { return Set.of(OrderRequest.class); }
            @Override public void process(FlowContext ctx) {
                // Declares produces OrderRequest but does NOT put it
            }
        };

        var def = Tramli.define("strict-test", FlowEngineErrorTest.TwoStep.class)
                .from(FlowEngineErrorTest.TwoStep.INIT).auto(FlowEngineErrorTest.TwoStep.DONE, badProducer)
                .onAnyError(FlowEngineErrorTest.TwoStep.ERROR)
                .build();

        var engine = new FlowEngine(new InMemoryFlowStore(), true); // strictMode
        var flow = engine.startFlow(def, "s1", Map.of());
        // Should route to error because strictMode detected produces violation
        assertEquals(FlowEngineErrorTest.TwoStep.ERROR, flow.currentState());
    }
}
