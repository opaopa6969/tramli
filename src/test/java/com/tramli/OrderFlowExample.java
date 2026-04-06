package com.tramli;

import java.time.Duration;
import java.util.Set;

/**
 * Example: Order flow using tramli.
 * This demonstrates the full pattern — state enum, processors, definition, engine.
 */
final class OrderFlowExample {

    // ─── 1. State enum ──────────────────────────────────────

    enum OrderState implements FlowState {
        CREATED(false, true),
        PAYMENT_PENDING(false, false),
        PAYMENT_CONFIRMED(false, false),
        SHIPPED(true, false),
        CANCELLED(true, false);

        private final boolean terminal, initial;
        OrderState(boolean terminal, boolean initial) { this.terminal = terminal; this.initial = initial; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    // ─── 2. Context data ────────────────────────────────────

    record OrderRequest(String itemId, int quantity) {}
    record PaymentIntent(String transactionId) {}
    record PaymentResult(String status) {}
    record ShipmentInfo(String trackingId) {}

    // ─── 3. Processors ─────────────────────────────────────

    static final StateProcessor ORDER_INIT = new StateProcessor() {
        @Override public String name() { return "OrderInit"; }
        @Override public Set<Class<?>> requires() { return Set.of(OrderRequest.class); }
        @Override public Set<Class<?>> produces() { return Set.of(PaymentIntent.class); }
        @Override public void process(FlowContext ctx) {
            OrderRequest req = ctx.get(OrderRequest.class);
            ctx.put(PaymentIntent.class, new PaymentIntent("txn-" + req.itemId()));
        }
    };

    static final StateProcessor SHIP = new StateProcessor() {
        @Override public String name() { return "ShipProcessor"; }
        @Override public Set<Class<?>> requires() { return Set.of(PaymentResult.class); }
        @Override public Set<Class<?>> produces() { return Set.of(ShipmentInfo.class); }
        @Override public void process(FlowContext ctx) {
            ctx.put(ShipmentInfo.class, new ShipmentInfo("TRACK-001"));
        }
    };

    // ─── 4. Guard ───────────────────────────────────────────

    static TransitionGuard paymentGuard(boolean accept) {
        return new TransitionGuard() {
            @Override public String name() { return "PaymentGuard"; }
            @Override public Set<Class<?>> requires() { return Set.of(PaymentIntent.class); }
            @Override public Set<Class<?>> produces() { return Set.of(PaymentResult.class); }
            @Override public int maxRetries() { return 3; }
            @Override public GuardOutput validate(FlowContext ctx) {
                if (accept) {
                    return new GuardOutput.Accepted(
                            java.util.Map.of(PaymentResult.class, new PaymentResult("OK")));
                }
                return new GuardOutput.Rejected("Payment declined");
            }
        };
    }

    // ─── 5. Flow definition ─────────────────────────────────

    static FlowDefinition<OrderState> definition(boolean acceptPayment) {
        return Tramli.define("order", OrderState.class)
                .ttl(Duration.ofHours(24))
                .maxGuardRetries(3)
                .initiallyAvailable(OrderRequest.class)
                .from(OrderState.CREATED).auto(OrderState.PAYMENT_PENDING, ORDER_INIT)
                .from(OrderState.PAYMENT_PENDING).external(OrderState.PAYMENT_CONFIRMED,
                        paymentGuard(acceptPayment))
                .from(OrderState.PAYMENT_CONFIRMED).auto(OrderState.SHIPPED, SHIP)
                .onAnyError(OrderState.CANCELLED)
                .build();
    }
}
