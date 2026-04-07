package com.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static com.tramli.OrderFlowExample.*;
import static org.junit.jupiter.api.Assertions.*;

class OrderFlowTest {

    @Test
    void happyPath() {
        var def = definition(true);
        var engine = Tramli.engine(new InMemoryFlowStore());

        // Start flow
        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 3));
        var flow = engine.startFlow(def, null, data);

        // Auto chain: CREATED → PAYMENT_PENDING
        assertEquals(OrderState.PAYMENT_PENDING, flow.currentState());
        assertFalse(flow.isCompleted());

        // External event: payment webhook
        flow = engine.resumeAndExecute(flow.id(), def);

        // Auto chain: PAYMENT_CONFIRMED → SHIPPED (terminal)
        assertTrue(flow.isCompleted());
        assertEquals("SHIPPED", flow.exitState());

        // Verify context has all data
        assertNotNull(flow.context().get(ShipmentInfo.class));
        assertEquals("TRACK-001", flow.context().get(ShipmentInfo.class).trackingId());
    }

    @Test
    void paymentRejected_cancelledAfterMaxRetries() {
        var def = definition(false);
        var engine = Tramli.engine(new InMemoryFlowStore());

        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 1));
        var flow = engine.startFlow(def, null, data);
        assertEquals(OrderState.PAYMENT_PENDING, flow.currentState());

        // 3 rejections
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(1, flow.guardFailureCount());
        flow = engine.resumeAndExecute(flow.id(), def);
        assertEquals(2, flow.guardFailureCount());
        flow = engine.resumeAndExecute(flow.id(), def);

        assertTrue(flow.isCompleted());
        assertEquals("CANCELLED", flow.exitState());
    }

    @Test
    void mermaidDiagram() {
        var def = definition(true);
        String mermaid = MermaidGenerator.generate(def);

        assertTrue(mermaid.contains("stateDiagram-v2"));
        assertTrue(mermaid.contains("[*] --> CREATED"));
        assertTrue(mermaid.contains("CREATED --> PAYMENT_PENDING : OrderInit"));
        assertTrue(mermaid.contains("PAYMENT_PENDING --> PAYMENT_CONFIRMED : [PaymentGuard]"));
        assertTrue(mermaid.contains("PAYMENT_CONFIRMED --> SHIPPED : ShipProcessor"));
        assertTrue(mermaid.contains("SHIPPED --> [*]"));
    }

    @Test
    void dataFlowGraph() {
        var def = definition(true);
        var graph = def.dataFlowGraph();

        // Available data at each state
        assertTrue(graph.availableAt(OrderState.CREATED).contains(OrderRequest.class));
        assertTrue(graph.availableAt(OrderState.PAYMENT_PENDING).contains(PaymentIntent.class));
        assertTrue(graph.availableAt(OrderState.SHIPPED).contains(ShipmentInfo.class));

        // Producers
        assertFalse(graph.producersOf(PaymentIntent.class).isEmpty());
        assertEquals("OrderInit", graph.producersOf(PaymentIntent.class).getFirst().name());

        // Consumers
        assertFalse(graph.consumersOf(OrderRequest.class).isEmpty());
        assertEquals("OrderInit", graph.consumersOf(OrderRequest.class).getFirst().name());

        // No dead data in this flow (all produced types are consumed downstream)
        // ShipmentInfo is produced but never required — it's dead data
        assertTrue(graph.deadData().contains(ShipmentInfo.class));
    }

    @Test
    void dataFlowMermaid() {
        var def = definition(true);
        String mermaid = MermaidGenerator.generateDataFlow(def);

        assertTrue(mermaid.contains("flowchart LR"));
        assertTrue(mermaid.contains("OrderInit"));
        assertTrue(mermaid.contains("PaymentIntent"));
        assertTrue(mermaid.contains("produces"));
        assertTrue(mermaid.contains("requires"));
    }

    @Test
    void dataFlowLifetime() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        var lt = graph.lifetime(PaymentIntent.class);
        assertNotNull(lt);
        assertEquals(OrderState.PAYMENT_PENDING, lt.firstProduced());
    }

    @Test
    void dataFlowPruningHints() {
        var def = definition(true);
        var hints = def.dataFlowGraph().pruningHints();
        // At SHIPPED (terminal), nothing is consumed, so everything available is prunable
        assertTrue(hints.containsKey(OrderState.SHIPPED));
    }

    @Test
    void processorCompatibility() {
        assertTrue(DataFlowGraph.isCompatible(ORDER_INIT, ORDER_INIT));
        // SHIP has different requires/produces than ORDER_INIT
        assertFalse(DataFlowGraph.isCompatible(ORDER_INIT, SHIP));
    }

    @Test
    void assertDataFlowOnHappyPath() {
        var def = definition(true);
        var engine = Tramli.engine(new InMemoryFlowStore());
        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 3));
        var flow = engine.startFlow(def, null, data);
        // At PAYMENT_PENDING, OrderRequest and PaymentIntent should be available
        var missing = def.dataFlowGraph().assertDataFlow(flow.context(), flow.currentState());
        assertTrue(missing.isEmpty(), "Missing types: " + missing);
    }

    @Test
    void definitionValidation() {
        var def = definition(true);
        assertEquals("order", def.name());
        assertEquals(OrderState.CREATED, def.initialState());
        assertTrue(def.terminalStates().contains(OrderState.SHIPPED));
        assertTrue(def.terminalStates().contains(OrderState.CANCELLED));
    }

    @Test
    void transitionLog() {
        var store = new InMemoryFlowStore();
        var engine = Tramli.engine(store);

        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 1));
        var flow = engine.startFlow(definition(true), null, data);

        // CREATED → PAYMENT_PENDING (1 transition)
        assertEquals(1, store.transitionLog().size());
        assertEquals("OrderInit", store.transitionLog().getFirst().trigger());

        engine.resumeAndExecute(flow.id(), definition(true));
        // + PaymentGuard + PAYMENT_CONFIRMED → SHIPPED
        assertTrue(store.transitionLog().size() >= 3);
    }
}
