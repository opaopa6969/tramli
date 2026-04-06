package com.tramli;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.*;
import java.util.stream.Stream;

import static com.tramli.OrderFlowExample.OrderState;
import static org.junit.jupiter.api.Assertions.*;

class InvalidTransitionTest {

    static Stream<Object[]> invalidTransitions() {
        var def = OrderFlowExample.definition(true);
        Set<String> valid = new HashSet<>();
        for (Transition<OrderState> t : def.transitions()) {
            valid.add(t.from().name() + "->" + t.to().name());
        }
        for (var entry : def.errorTransitions().entrySet()) {
            valid.add(entry.getKey().name() + "->" + entry.getValue().name());
        }
        List<Object[]> invalid = new ArrayList<>();
        for (OrderState from : OrderState.values()) {
            for (OrderState to : OrderState.values()) {
                String key = from.name() + "->" + to.name();
                if (!valid.contains(key)) invalid.add(new Object[]{from, to});
            }
        }
        return invalid.stream();
    }

    @ParameterizedTest(name = "{0} -> {1} should be invalid")
    @MethodSource("invalidTransitions")
    void allInvalidTransitions_areRejected(OrderState from, OrderState to) {
        var def = OrderFlowExample.definition(true);
        boolean hasTransition = def.transitions().stream()
                .anyMatch(t -> t.from() == from && t.to() == to);
        boolean hasError = to.equals(def.errorTransitions().get(from));
        assertFalse(hasTransition || hasError,
                "Expected no transition from " + from + " to " + to);
    }
}
