package org.unlaxer.tramli;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.unlaxer.tramli.OrderFlowExample.*;
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

    // ─── v1.4.0+ API tests ──────────────────────────────

    @Test
    void impactOf() {
        var def = definition(true);
        var impact = def.dataFlowGraph().impactOf(PaymentIntent.class);
        assertFalse(impact.producers().isEmpty());
        assertFalse(impact.consumers().isEmpty());
    }

    @Test
    void parallelismHints() {
        var def = definition(true);
        var hints = def.dataFlowGraph().parallelismHints();
        assertNotNull(hints); // may be empty if all processors are dependent
    }

    @Test
    void toJson() {
        var def = definition(true);
        String json = def.dataFlowGraph().toJson();
        assertTrue(json.contains("\"types\""));
        assertTrue(json.contains("\"deadData\""));
        assertTrue(json.contains("OrderRequest"));
    }

    @Test
    void migrationOrderAndMarkdown() {
        var def = definition(true);
        var order = def.dataFlowGraph().migrationOrder();
        assertFalse(order.isEmpty());
        assertEquals("OrderInit", order.getFirst());

        String md = def.dataFlowGraph().toMarkdown();
        assertTrue(md.contains("# Migration Checklist"));
        assertTrue(md.contains("OrderInit"));
    }

    @Test
    void crossFlowMap() {
        var def1 = definition(true);
        var def2 = definition(true);
        var map = DataFlowGraph.crossFlowMap(def1.dataFlowGraph(), def2.dataFlowGraph());
        assertNotNull(map); // same flow → types cross-reference themselves
    }

    @Test
    void diffGraphs() {
        var def = definition(true);
        var result = DataFlowGraph.diff(def.dataFlowGraph(), def.dataFlowGraph());
        assertTrue(result.addedTypes().isEmpty());
        assertTrue(result.removedTypes().isEmpty());
    }

    @Test
    void versionCompatibility() {
        var def = definition(true);
        var issues = DataFlowGraph.versionCompatibility(def.dataFlowGraph(), def.dataFlowGraph());
        assertTrue(issues.isEmpty()); // same version → no issues
    }

    @Test
    void skeletonGenerator() {
        var def = definition(true);
        String java = SkeletonGenerator.generate(def, SkeletonGenerator.Language.JAVA);
        assertTrue(java.contains("OrderInit"));
        assertTrue(java.contains("process(FlowContext"));

        String ts = SkeletonGenerator.generate(def, SkeletonGenerator.Language.TYPESCRIPT);
        assertTrue(ts.contains("OrderInit"));

        String rust = SkeletonGenerator.generate(def, SkeletonGenerator.Language.RUST);
        assertTrue(rust.contains("OrderInit"));
        assertTrue(rust.contains("FlowContext"));
    }

    @Test
    void generateExternalContract() {
        var def = definition(true);
        String mermaid = MermaidGenerator.generateExternalContract(def);
        assertTrue(mermaid.contains("flowchart LR"));
        assertTrue(mermaid.contains("PaymentGuard"));
        assertTrue(mermaid.contains("client sends"));
    }

    @Test
    void availableDataAndMissingFor() {
        var def = definition(true);
        var engine = Tramli.engine(new InMemoryFlowStore());
        @SuppressWarnings({"unchecked", "rawtypes"})
        Map<Class<?>, Object> data = Map.of((Class) OrderRequest.class, new OrderRequest("item-1", 3));
        var flow = engine.startFlow(def, null, data);

        assertFalse(flow.availableData().isEmpty());
        // missingFor at PAYMENT_PENDING should be empty (guard requires are available)
        assertTrue(flow.missingFor().isEmpty());
    }

    @Test
    void flowContextAlias() {
        var ctx = new FlowContext("test-alias");
        ctx.registerAlias(OrderRequest.class, "OrderRequest");
        ctx.put(OrderRequest.class, new OrderRequest("x", 1));

        var aliasMap = ctx.toAliasMap();
        assertTrue(aliasMap.containsKey("OrderRequest"));
        assertEquals("x", ((OrderRequest) aliasMap.get("OrderRequest")).itemId());
    }

    @Test
    void withPlugin() {
        var def = definition(true);
        var pluginDef = Tramli.define("plugin", FlowEngineErrorTest.SubSimple.class)
                .from(FlowEngineErrorTest.SubSimple.SS_INIT)
                .auto(FlowEngineErrorTest.SubSimple.SS_DONE,
                        new StateProcessor() {
                            @Override public String name() { return "PluginProc"; }
                            @Override public java.util.Set<Class<?>> requires() { return java.util.Set.of(); }
                            @Override public java.util.Set<Class<?>> produces() { return java.util.Set.of(); }
                            @Override public void process(FlowContext ctx) {}
                        })
                .build();

        var extended = def.withPlugin(OrderState.CREATED, OrderState.PAYMENT_PENDING, pluginDef);
        assertNotNull(extended);
        assertTrue(extended.name().contains("plugin"));
        // Verify sub-flow transition was inserted
        assertTrue(extended.transitions().stream().anyMatch(Transition::isSubFlow));
        // Original auto transition was replaced
        assertFalse(extended.transitions().stream()
                .anyMatch(t -> t.from() == OrderState.CREATED && t.to() == OrderState.PAYMENT_PENDING && t.isAuto()));
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

    // ─── explain() / whyMissing() tests ─────────────────────

    @Test
    void explainAtState_noMissing() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // At CREATED: OrderRequest is available, that's what OrderInit requires
        var result = graph.explain(OrderState.CREATED);
        assertEquals(OrderState.CREATED, result.state());
        assertTrue(result.available().contains(OrderRequest.class));
        assertTrue(result.missing().isEmpty(), "Expected no missing types at CREATED");
    }

    @Test
    void explainAtState_withSpecificKey_available() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // OrderRequest is available at CREATED
        var result = graph.explain(OrderState.CREATED, OrderRequest.class);
        assertTrue(result.missing().isEmpty());
        assertTrue(result.available().contains(OrderRequest.class));
    }

    @Test
    void explainAtState_withSpecificKey_notAvailable() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // ShipmentInfo is NOT available at CREATED
        var result = graph.explain(OrderState.CREATED, ShipmentInfo.class);
        assertEquals(1, result.missing().size());
        var missing = result.missing().getFirst();
        assertEquals(ShipmentInfo.class, missing.type());
        assertFalse(missing.reason().isEmpty());
        // ShipmentInfo is produced by ShipProcessor
        assertFalse(missing.producers().isEmpty());
        assertEquals("ShipProcessor", missing.producers().getFirst().name());
    }

    @Test
    void explainAtState_neverProducedType() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // String.class is never in the flow at all
        var result = graph.explain(OrderState.CREATED, String.class);
        assertEquals(1, result.missing().size());
        var missing = result.missing().getFirst();
        assertEquals(String.class, missing.type());
        assertTrue(missing.reason().contains("never produced"));
        assertTrue(missing.producers().isEmpty());
    }

    @Test
    void whyMissing_typeIsAvailable() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // OrderRequest IS available at CREATED
        var lines = graph.whyMissing(OrderRequest.class, OrderState.CREATED);
        assertEquals(1, lines.size());
        assertTrue(lines.getFirst().contains("IS available"));
    }

    @Test
    void whyMissing_typeNeverProduced() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // String.class is never produced
        var lines = graph.whyMissing(String.class, OrderState.CREATED);
        assertTrue(lines.stream().anyMatch(l -> l.contains("never produced")));
    }

    @Test
    void whyMissing_typeProducedElsewhere() {
        var def = definition(true);
        var graph = def.dataFlowGraph();
        // ShipmentInfo is produced at PAYMENT_CONFIRMED→SHIPPED but not available at CREATED
        var lines = graph.whyMissing(ShipmentInfo.class, OrderState.CREATED);
        assertTrue(lines.stream().anyMatch(l -> l.contains("produced by")));
        assertTrue(lines.stream().anyMatch(l -> l.contains("ShipProcessor")));
        // Should also show what IS available at CREATED
        assertTrue(lines.stream().anyMatch(l -> l.contains("Available at CREATED")));
    }
}
