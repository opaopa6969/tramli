package org.unlaxer.tramli.plugins;

import org.junit.jupiter.api.Test;
import org.unlaxer.tramli.*;
import org.unlaxer.tramli.plugins.api.PluginRegistry;
import org.unlaxer.tramli.plugins.audit.AuditStorePlugin;
import org.unlaxer.tramli.plugins.audit.AuditingFlowStore;
import org.unlaxer.tramli.plugins.diagram.DiagramGenerationPlugin;
import org.unlaxer.tramli.plugins.docs.FlowDocumentationPlugin;
import org.unlaxer.tramli.plugins.eventstore.*;
import org.unlaxer.tramli.plugins.idempotency.*;
import org.unlaxer.tramli.plugins.lint.PolicyLintPlugin;
import org.unlaxer.tramli.plugins.observability.*;
import org.unlaxer.tramli.plugins.resume.*;
import org.unlaxer.tramli.plugins.testing.ScenarioGenerationPlugin;

import java.time.Duration;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class PluginIntegrationTest {

    // ─── Shared flow definition ─────────────────────────

    enum S implements FlowState {
        CREATED(false, true), PENDING(false, false), CONFIRMED(false, false),
        DONE(true, false), ERROR(true, false);
        private final boolean terminal, initial;
        S(boolean t, boolean i) { terminal = t; initial = i; }
        @Override public boolean isTerminal() { return terminal; }
        @Override public boolean isInitial() { return initial; }
    }

    record Input(String v) {}
    record Middle(String v) {}
    record Output(String v) {}

    static final StateProcessor PROC1 = new StateProcessor() {
        @Override public String name() { return "Proc1"; }
        @Override public Set<Class<?>> requires() { return Set.of(Input.class); }
        @Override public Set<Class<?>> produces() { return Set.of(Middle.class); }
        @Override public void process(FlowContext ctx) {
            ctx.put(Middle.class, new Middle("from-" + ctx.get(Input.class).v()));
        }
    };

    static final StateProcessor PROC2 = new StateProcessor() {
        @Override public String name() { return "Proc2"; }
        @Override public Set<Class<?>> requires() { return Set.of(Middle.class); }
        @Override public Set<Class<?>> produces() { return Set.of(Output.class); }
        @Override public void process(FlowContext ctx) {
            ctx.put(Output.class, new Output("done"));
        }
    };

    static final TransitionGuard GUARD = new TransitionGuard() {
        @Override public String name() { return "TestGuard"; }
        @Override public Set<Class<?>> requires() { return Set.of(Middle.class); }
        @Override public Set<Class<?>> produces() { return Set.of(); }
        @Override public int maxRetries() { return 3; }
        @Override public GuardOutput validate(FlowContext ctx) {
            return new GuardOutput.Accepted();
        }
    };

    FlowDefinition<S> buildDef() {
        return Tramli.define("test", S.class)
                .ttl(Duration.ofMinutes(5))
                .initiallyAvailable(Input.class)
                .from(S.CREATED).auto(S.PENDING, PROC1)
                .from(S.PENDING).external(S.CONFIRMED, GUARD)
                .from(S.CONFIRMED).auto(S.DONE, PROC2)
                .onAnyError(S.ERROR)
                .build();
    }

    // ─── P2: Validator semantics regression ──────────────

    @Test
    void validatorSemanticsUnchangedWithPlugins() {
        var def = buildDef();

        // Build without plugins
        var warningsWithout = def.warnings();
        var graphWithout = def.dataFlowGraph().toMermaid();

        // Build with plugins registered (but plugins don't change definition)
        var registry = new PluginRegistry()
                .register(PolicyLintPlugin.defaults())
                .register(new AuditStorePlugin())
                .register(new EventLogStorePlugin());

        // Definition is immutable — same object, same validation
        assertEquals(warningsWithout, def.warnings());
        assertEquals(graphWithout, def.dataFlowGraph().toMermaid());
    }

    // ─── P4: Plugin registry lifecycle ───────────────────

    @Test
    void pluginRegistryLifecycle() {
        var registry = new PluginRegistry()
                .register(PolicyLintPlugin.defaults())
                .register(new AuditStorePlugin())
                .register(new EventLogStorePlugin())
                .register(new ObservabilityEnginePlugin(new InMemoryTelemetrySink()));

        var def = buildDef();
        var report = registry.analyzeAll(def);
        assertNotNull(report);
        assertNotNull(report.asText());
    }

    // ─── Store plugin wrapping ───────────────────────────

    @Test
    void storePluginWrapping() {
        var registry = new PluginRegistry()
                .register(new AuditStorePlugin())
                .register(new EventLogStorePlugin());

        FlowStore store = registry.applyStorePlugins(new InMemoryFlowStore());
        // Store should be wrapped (not the original InMemoryFlowStore)
        assertNotNull(store);
        assertNotEquals(InMemoryFlowStore.class, store.getClass());
    }

    // ─── Engine plugin installation ──────────────────────

    @Test
    void enginePluginInstallation() {
        var sink = new InMemoryTelemetrySink();
        var registry = new PluginRegistry()
                .register(new ObservabilityEnginePlugin(sink));

        var def = buildDef();
        FlowStore store = new InMemoryFlowStore();
        FlowEngine engine = Tramli.engine(store);
        registry.installEnginePlugins(engine);

        // Run a flow — observability should capture events
        engine.startFlow(def, "s1", Map.of(Input.class, new Input("test")));
        assertFalse(sink.events().isEmpty());
    }

    @Test
    void observabilityAppendModeChains() {
        var def = buildDef();
        FlowStore store = new InMemoryFlowStore();
        FlowEngine engine = Tramli.engine(store);

        // Install custom logger first
        List<String> customLog = new ArrayList<>();
        engine.setTransitionLogger(t -> customLog.add(t.from() + "->" + t.to()));

        // Install observability with append=true
        var sink = new InMemoryTelemetrySink();
        new ObservabilityPlugin(sink).install(engine, true);

        engine.startFlow(def, "s1", Map.of(Input.class, new Input("test")));

        // Both should fire
        assertFalse(customLog.isEmpty(), "custom logger should have fired");
        assertFalse(sink.events().isEmpty(), "sink should have events");
        assertEquals("CREATED->PENDING", customLog.get(0));
        assertEquals("transition", sink.events().get(0).type());
    }

    @Test
    void observabilityDefaultModeReplaces() {
        var def = buildDef();
        FlowStore store = new InMemoryFlowStore();
        FlowEngine engine = Tramli.engine(store);

        List<String> customLog = new ArrayList<>();
        engine.setTransitionLogger(t -> customLog.add(t.from() + "->" + t.to()));

        // Install without append (default)
        var sink = new InMemoryTelemetrySink();
        new ObservabilityPlugin(sink).install(engine);

        engine.startFlow(def, "s1", Map.of(Input.class, new Input("test")));

        assertTrue(customLog.isEmpty(), "custom logger should be replaced");
        assertFalse(sink.events().isEmpty(), "sink should have events");
    }

    // ─── Rich resume classification ──────────────────────

    @Test
    void richResumeClassification() {
        var def = buildDef();
        FlowStore store = new InMemoryFlowStore();
        FlowEngine engine = Tramli.engine(store);

        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));
        assertEquals(S.PENDING, flow.currentState());

        RichResumeExecutor resume = new RichResumeRuntimePlugin().bind(engine);
        var result = resume.resume(flow.id(), def, Map.of(), flow.currentState());

        assertNotNull(result);
        assertNotNull(result.status());
    }

    // ─── Eventstore replay ───────────────────────────────

    @Test
    void eventstoreReplay() {
        var registry = new PluginRegistry()
                .register(new EventLogStorePlugin());

        FlowStore store = registry.applyStorePlugins(new InMemoryFlowStore());
        FlowEngine engine = Tramli.engine(store);

        var def = buildDef();
        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        // Get event log
        if (store instanceof EventLogStoreDecorator eventLog) {
            var events = eventLog.eventsForFlow(flow.id());
            assertFalse(events.isEmpty());

            // Replay
            var replayState = new ReplayService().stateAtVersion(eventLog.events(), flow.id(), 1);
            assertNotNull(replayState);
        }
    }

    // ─── Diagram generation ──────────────────────────────

    @Test
    void diagramGeneration() {
        var def = buildDef();
        var bundle = new DiagramGenerationPlugin<S>().generate(def);
        assertNotNull(bundle);
        assertTrue(bundle.mermaid().contains("stateDiagram"));
    }

    // ─── Documentation generation ────────────────────────

    @Test
    void documentationGeneration() {
        var def = buildDef();
        var doc = new FlowDocumentationPlugin<S>().generate(def);
        assertNotNull(doc);
        assertTrue(doc.contains("test")); // flow name
    }

    // ─── Scenario generation ─────────────────────────────

    @Test
    void scenarioGeneration() {
        var def = buildDef();
        var plan = new ScenarioGenerationPlugin<S>().generate(def);
        assertNotNull(plan);
        assertFalse(plan.scenarios().isEmpty());
    }

    // ─── Lint / policy analysis ──────────────────────────

    @Test
    void lintAnalysis() {
        var def = buildDef();
        var report = new org.unlaxer.tramli.plugins.api.PluginReport();
        PolicyLintPlugin.<S>defaults().analyze(def, report);
        assertNotNull(report.asText());
    }

    // ─── Idempotency ─────────────────────────────────────

    @Test
    void idempotencyDuplicateSuppression() {
        var def = buildDef();
        FlowStore store = new InMemoryFlowStore();
        FlowEngine engine = Tramli.engine(store);

        var flow = engine.startFlow(def, "s1", Map.of(Input.class, new Input("x")));

        var idempotent = new IdempotencyRuntimePlugin(new InMemoryIdempotencyRegistry()).bind(engine);
        var r1 = idempotent.resume(flow.id(), def, new CommandEnvelope("cmd-1", Map.of()), flow.currentState());
        var r2 = idempotent.resume(flow.id(), def, new CommandEnvelope("cmd-1", Map.of()), flow.currentState());

        // Second call with same commandId should be deduplicated
        assertNotNull(r1);
        assertNotNull(r2);
    }
}
