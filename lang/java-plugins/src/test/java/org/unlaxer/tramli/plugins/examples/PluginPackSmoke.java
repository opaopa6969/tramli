package org.unlaxer.tramli.plugins.examples;

import org.unlaxer.tramli.*;
import org.unlaxer.tramli.plugins.api.PluginRegistry;
import org.unlaxer.tramli.plugins.audit.AuditStorePlugin;
import org.unlaxer.tramli.plugins.diagram.DiagramGenerationPlugin;
import org.unlaxer.tramli.plugins.docs.FlowDocumentationPlugin;
import org.unlaxer.tramli.plugins.eventstore.*;
import org.unlaxer.tramli.plugins.idempotency.CommandEnvelope;
import org.unlaxer.tramli.plugins.idempotency.IdempotencyRuntimePlugin;
import org.unlaxer.tramli.plugins.idempotency.InMemoryIdempotencyRegistry;
import org.unlaxer.tramli.plugins.lint.PolicyLintPlugin;
import org.unlaxer.tramli.plugins.observability.InMemoryTelemetrySink;
import org.unlaxer.tramli.plugins.observability.ObservabilityEnginePlugin;
import org.unlaxer.tramli.plugins.resume.RichResumeExecutor;
import org.unlaxer.tramli.plugins.resume.RichResumeRuntimePlugin;
import org.unlaxer.tramli.plugins.testing.ScenarioGenerationPlugin;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public final class PluginPackSmoke {
    enum OrderState implements FlowState {
        CREATED(false, true), PAYMENT_PENDING(false, false), PAYMENT_CONFIRMED(false, false), SHIPPED(true, false), CANCELLED(true, false);
        private final boolean terminal; private final boolean initial;
        OrderState(boolean terminal, boolean initial) { this.terminal = terminal; this.initial = initial; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record OrderRequest(String itemId) {}
    record PaymentIntent(String id) {}
    record PaymentResult(String status) {}
    record ShipmentInfo(String trackingId) {}

    static final StateProcessor INIT = new StateProcessor() {
        @Override public String name() { return "Init"; }
        @Override public Set<Class<?>> requires() { return Set.of(OrderRequest.class); }
        @Override public Set<Class<?>> produces() { return Set.of(PaymentIntent.class); }
        @Override public void process(FlowContext ctx) { ctx.put(PaymentIntent.class, new PaymentIntent("txn-1")); }
    };

    static final StateProcessor SHIP = new StateProcessor() {
        @Override public String name() { return "Ship"; }
        @Override public Set<Class<?>> requires() { return Set.of(PaymentResult.class); }
        @Override public Set<Class<?>> produces() { return Set.of(ShipmentInfo.class); }
        @Override public void process(FlowContext ctx) { ctx.put(ShipmentInfo.class, new ShipmentInfo("TRK-1")); }
    };

    static final TransitionGuard PAY = new TransitionGuard() {
        @Override public String name() { return "Pay"; }
        @Override public Set<Class<?>> requires() { return Set.of(PaymentIntent.class); }
        @Override public Set<Class<?>> produces() { return Set.of(PaymentResult.class); }
        @Override public int maxRetries() { return 1; }
        @Override public GuardOutput validate(FlowContext ctx) {
            return new GuardOutput.Accepted(Map.of(PaymentResult.class, new PaymentResult("OK")));
        }
    };

    public static void main(String[] args) {
        FlowDefinition<OrderState> definition = Tramli.define("order", OrderState.class)
                .ttl(Duration.ofMinutes(5))
                .initiallyAvailable(OrderRequest.class)
                .from(OrderState.CREATED).auto(OrderState.PAYMENT_PENDING, INIT)
                .from(OrderState.PAYMENT_PENDING).external(OrderState.PAYMENT_CONFIRMED, PAY)
                .from(OrderState.PAYMENT_CONFIRMED).auto(OrderState.SHIPPED, SHIP)
                .onAnyError(OrderState.CANCELLED)
                .build();

        var registry = new PluginRegistry()
                .register(PolicyLintPlugin.defaults())
                .register(new AuditStorePlugin())
                .register(new EventLogStorePlugin())
                .register(new ObservabilityEnginePlugin(new InMemoryTelemetrySink()));
        System.out.println(registry.analyzeAll(definition).asText());

        FlowStore store = registry.applyStorePlugins(new InMemoryFlowStore());
        FlowEngine engine = Tramli.engine(store);
        registry.installEnginePlugins(engine);

        FlowInstance<OrderState> instance = engine.startFlow(definition, "session-1", Map.of(OrderRequest.class, new OrderRequest("book")));

        RichResumeExecutor richResume = new RichResumeRuntimePlugin().bind(engine);
        System.out.println(richResume.resume(instance.id(), definition, Map.of(), instance.currentState()).status());

        var idempotentResume = new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()).bind(engine);
        System.out.println(idempotentResume.resume(instance.id(), definition,
                new CommandEnvelope("cmd-1", Map.of()), instance.currentState()).status());

        EventLogStoreDecorator eventLog = unwrapEventLog(store);
        if (eventLog != null) {
            VersionedTransitionEvent last = eventLog.eventsForFlow(instance.id()).get(eventLog.eventsForFlow(instance.id()).size() - 1);
            CompensationService compensation = new CompensationService((event, cause) ->
                    Optional.of(new CompensationPlan("refund-payment", Map.of("sourceTrigger", event.trigger(), "reason", cause.getMessage()))), eventLog);
            compensation.compensate(last, new RuntimeException("gateway timeout"));
            System.out.println(new ReplayService().stateAtVersion(eventLog.events(), instance.id(), 1));
            System.out.println(new ProjectionReplayService().stateAtVersion(eventLog.events(), instance.id(), 999,
                    new ProjectionReducer<Integer>() {
                        @Override public Integer initialState() { return 0; }
                        @Override public Integer apply(Integer current, VersionedTransitionEvent event) {
                            return current + 1;
                        }
                    }));
        }

        System.out.println(new DiagramGenerationPlugin<OrderState>().generate(definition).mermaid());
        System.out.println(new FlowDocumentationPlugin<OrderState>().generate(definition));
        System.out.println(new ScenarioGenerationPlugin<OrderState>().generate(definition).scenarios().size());
    }

    private static EventLogStoreDecorator unwrapEventLog(FlowStore store) {
        if (store instanceof EventLogStoreDecorator eventLog) {
            return eventLog;
        }
        if (store instanceof org.unlaxer.tramli.plugins.audit.AuditingFlowStore audited) {
            try {
                var field = audited.getClass().getDeclaredField("delegate");
                field.setAccessible(true);
                Object delegate = field.get(audited);
                if (delegate instanceof EventLogStoreDecorator eventLog) {
                    return eventLog;
                }
            } catch (ReflectiveOperationException ignored) {
                return null;
            }
        }
        return null;
    }
}
