package org.unlaxer.tramli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;

import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Test-only fixed pools. Cases run serially and configuration is thread-local. */
@Execution(ExecutionMode.SAME_THREAD)
class BuildVerdictTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ThreadLocal<JsonNode> CONFIG = new ThreadLocal<>();
    enum State implements FlowState {
        S0, S1, S2, S3, S4, S5, S6, S7;
        public boolean isInitial() { return CONFIG.get().get(ordinal()).path("initial").asBoolean(); }
        public boolean isTerminal() { return CONFIG.get().get(ordinal()).path("terminal").asBoolean(); }
    }
    static final class T0 {} static final class T1 {} static final class T2 {} static final class T3 {}
    static final class T4 {} static final class T5 {} static final class T6 {} static final class T7 {}
    private static final Class<?>[] TYPES = { T0.class, T1.class, T2.class, T3.class, T4.class, T5.class, T6.class, T7.class };
    private static Set<Class<?>> types(JsonNode values) {
        Set<Class<?>> result = new HashSet<>();
        values.forEach(v -> result.add(TYPES[Integer.parseInt(v.asText().substring(1))]));
        return result;
    }
    private static State state(JsonNode n, String key) { return State.valueOf(n.get(key).asText()); }
    private static StateProcessor processor(String name, JsonNode p) {
        return new StateProcessor() {
            public String name() { return name; }
            public Set<Class<?>> requires() { return types(p.get("requires")); }
            public Set<Class<?>> produces() { return types(p.get("produces")); }
            public void process(FlowContext ctx) { throw new AssertionError("Validation must not execute processors"); }
        };
    }
    private static FlowDefinition.Builder<State> build(JsonNode c) {
        CONFIG.set(c.get("states"));
        var b = FlowDefinition.builder(c.get("id").asText(), State.class);
        b.initiallyAvailable(types(c.get("initiallyAvailable")).toArray(Class<?>[]::new));
        b.externallyProvided(types(c.get("externallyProvided")).toArray(Class<?>[]::new));
        if (c.get("allowPerpetual").asBoolean()) b.allowPerpetual();
        if (c.get("allowUnreachable").asBoolean()) b.allowUnreachable();
        int i = 0;
        for (var t : c.get("transitions")) {
            String name = "e" + i++;
            var from = b.from(state(t, "from"));
            switch (t.get("kind").asText()) {
                case "auto" -> from.auto(state(t, "to"), processor(name, t.get("processor")));
                case "external" -> {
                    var g = t.get("guard");
                    var guard = new TransitionGuard() {
                        public String name() { return name; }
                        public Set<Class<?>> requires() { return types(g.get("requires")); }
                        public Set<Class<?>> produces() { return types(g.get("produces")); }
                        public int maxRetries() { return 3; }
                        public GuardOutput validate(FlowContext ctx) { throw new AssertionError("Validation must not execute guards"); }
                    };
                    if (t.has("processor")) from.external(state(t, "to"), guard, processor(name, t.get("processor")));
                    else from.external(state(t, "to"), guard);
                }
                case "branch" -> {
                    var branch = from.branch(new BranchProcessor() {
                        public String name() { return name; }
                        public Set<Class<?>> requires() { return types(t.get("branch").get("requires")); }
                        public String decide(FlowContext ctx) { throw new AssertionError("Validation must not execute branches"); }
                    });
                    int j = 0;
                    for (var target : t.get("targets")) {
                        String targetName = name + "b" + j++;
                        if (target.has("processor")) branch.to(state(target, "to"), target.get("label").asText(), processor(targetName, target.get("processor")));
                        else branch.to(state(target, "to"), target.get("label").asText());
                    }
                    branch.endBranch();
                }
                default -> throw new AssertionError("Unknown transition kind");
            }
        }
        for (var r : c.get("onError")) b.onError(state(r, "from"), state(r, "to"));
        for (var r : c.get("onStepError")) b.onStepError(state(r, "from"), Exception.class, state(r, "to"));
        return b;
    }
    private static List<String> normalize(FlowDefinition.ValidationError e) {
        var m = Pattern.compile("^(Processor|Guard|Branch) '([^']+)' at (S\\d+)(?: -> (S\\d+))? requires ").matcher(e.message());
        if (m.find()) return List.of("MISSING_REQUIRES", m.group(1).toLowerCase(Locale.ROOT) + ":" + m.group(2) + "@" + m.group(3) + (m.group(4) == null ? "" : "->" + m.group(4)));
        if (Set.of("DAG_CYCLE", "NO_INITIAL_STATE").contains(e.code())) return List.of(e.code(), "flow");
        m = Pattern.compile("^Terminal state (S\\d+) has an outgoing transition to (S\\d+)").matcher(e.message());
        if (m.find()) return List.of("TERMINAL_OUTGOING", m.group(1) + "->" + m.group(2));
        m = Pattern.compile("^(?:State |No path from )(S\\d+)").matcher(e.message());
        if (m.find()) return List.of(e.code(), m.group(1));
        throw new AssertionError("Unrecognized diagnostic: " + e);
    }
    private static JsonNode verdict(JsonNode c) {
        try {
            var result = build(c).buildAndValidate();
            boolean ok;
            try { build(c).build(); ok = true; } catch (FlowException e) { ok = false; }
            assertEquals(result.errors().isEmpty(), ok, c.get("id") + ": build/buildAndValidate parity");
            assertEquals(ok, result.definition() != null);
            var pairs = new TreeMap<String, List<String>>();
            result.errors().forEach(e -> { var pair = normalize(e); pairs.put(String.join("|", pair), pair); });
            return JSON.valueToTree(Map.of("ok", ok, "errors", pairs.values()));
        } finally { CONFIG.remove(); }
    }
    @TestFactory
    Stream<DynamicTest> sharedBuildVerdicts() throws Exception {
        Path dir = Path.of("../../shared-tests/build-verdicts");
        String input = System.getenv("BUILD_VERDICT_CORPUS"), output = System.getenv("BUILD_VERDICT_OUTPUT");
        var cases = JSON.readTree((input == null ? dir.resolve("corpus.json") : Path.of(input)).toFile());
        if (output != null) return Stream.of(DynamicTest.dynamicTest("export every verdict without skips", () -> {
            var results = JSON.createObjectNode();
            for (var c : cases) results.set(c.get("id").asText(), verdict(c));
            JSON.writeValue(Path.of(output).toFile(), results);
        }));
        var expected = JSON.readTree(dir.resolve("expected.json").toFile());
        var tests = new ArrayList<DynamicTest>();
        for (var c : cases) {
            String id = c.get("id").asText();
            var issues = new ArrayList<String>();
            expected.get("knownMismatches").fields().forEachRemaining(entry -> {
                var skip = entry.getValue();
                if (skip.get("languages").toString().contains("\"java\"") && skip.get("cases").toString().contains("\"" + id + "\"")) issues.add("#" + entry.getKey());
            });
            tests.add(DynamicTest.dynamicTest(id, () -> {
                assumeTrue(issues.isEmpty(), "Known mismatch " + issues);
                assertEquals(expected.get("verdicts").get(id), verdict(c), id);
            }));
        }
        return tests.stream();
    }
}
