package org.unlaxer.tramli;

import java.util.*;
import java.util.function.Consumer;

/**
 * Build-time verified pipeline — sequential step chain with requires/produces contracts.
 *
 * <pre>
 * var pipeline = Tramli.pipeline("etl")
 *     .initiallyAvailable(RawInput.class)
 *     .step(parse).step(validate).step(save)
 *     .build();
 * FlowContext result = pipeline.execute(Map.of(RawInput.class, data));
 * </pre>
 */
public final class Pipeline {
    private final String name;
    private final List<PipelineStep> steps;
    private final Set<Class<?>> initiallyAvailable;
    private final PipelineDataFlow dataFlow;
    private boolean strictMode;
    private Consumer<LogEntry.Transition> transitionLogger;
    private Consumer<LogEntry.State> stateLogger;
    private Consumer<LogEntry.Error> errorLogger;

    private Pipeline(String name, List<PipelineStep> steps, Set<Class<?>> initiallyAvailable) {
        this.name = name;
        this.steps = List.copyOf(steps);
        this.initiallyAvailable = Set.copyOf(initiallyAvailable);
        this.dataFlow = new PipelineDataFlow(steps, initiallyAvailable);
    }

    public String name() { return name; }
    public PipelineDataFlow dataFlow() { return dataFlow; }

    public void setStrictMode(boolean strict) { this.strictMode = strict; }
    public void setTransitionLogger(Consumer<LogEntry.Transition> l) { this.transitionLogger = l; }
    public void setStateLogger(Consumer<LogEntry.State> l) { this.stateLogger = l; }
    public void setErrorLogger(Consumer<LogEntry.Error> l) { this.errorLogger = l; }
    public void removeAllLoggers() {
        this.transitionLogger = null;
        this.stateLogger = null;
        this.errorLogger = null;
    }

    /**
     * Execute the pipeline. Returns the FlowContext with all produced data.
     * @throws PipelineException if a step fails
     */
    public FlowContext execute(Map<Class<?>, Object> initialData) {
        String flowId = UUID.randomUUID().toString();
        var ctx = new FlowContext(flowId);
        for (var entry : initialData.entrySet()) {
            @SuppressWarnings({"unchecked", "rawtypes"})
            Class key = entry.getKey();
            ctx.put(key, entry.getValue());
        }

        var completed = new ArrayList<String>();
        String prev = "initial";

        for (var step : steps) {
            long stepStart = System.nanoTime();

            // Transition log
            if (transitionLogger != null) {
                transitionLogger.accept(new LogEntry.Transition(flowId, name, prev, step.name(), step.name(), 0));
            }

            // State logger: capture keys before
            Set<Class<?>> keysBefore = stateLogger != null ? new HashSet<>(ctx.snapshot().keySet()) : null;

            try {
                step.process(ctx);
            } catch (Exception e) {
                if (errorLogger != null) {
                    long durationMicros = (System.nanoTime() - stepStart) / 1000;
                    errorLogger.accept(new LogEntry.Error(flowId, name, prev, step.name(), step.name(), e, durationMicros));
                }
                throw new PipelineException(step.name(), completed, ctx, e);
            }

            // strictMode: verify produces
            if (strictMode) {
                for (Class<?> prod : step.produces()) {
                    if (!ctx.has(prod)) {
                        var ex = new FlowException("PRODUCES_VIOLATION",
                                "Step '" + step.name() + "' declares produces " + prod.getSimpleName() + " but did not put it");
                        throw new PipelineException(step.name(), completed, ctx, ex);
                    }
                }
            }

            // State logger: emit new keys
            if (stateLogger != null && keysBefore != null) {
                for (var key : ctx.snapshot().keySet()) {
                    if (!keysBefore.contains(key)) {
                        stateLogger.accept(new LogEntry.State(flowId, name, step.name(), key, ctx.snapshot().get(key)));
                    }
                }
            }

            completed.add(step.name());
            prev = step.name();
        }

        return ctx;
    }

    /**
     * Convert this Pipeline to a PipelineStep for nesting in another Pipeline.
     */
    public PipelineStep asStep() {
        return new PipelineStep() {
            @Override public String name() { return Pipeline.this.name; }
            @Override public Set<Class<?>> requires() { return Pipeline.this.initiallyAvailable; }
            @Override public Set<Class<?>> produces() {
                var all = new LinkedHashSet<Class<?>>();
                for (var s : steps) all.addAll(s.produces());
                return all;
            }
            @Override public void process(FlowContext ctx) {
                // Re-execute steps on the shared context
                for (var s : steps) s.process(ctx);
            }
        };
    }

    // ─── Builder ─────────────────────────────────────────

    public static PipelineBuilder builder(String name) {
        return new PipelineBuilder(name);
    }

    public static final class PipelineBuilder {
        private final String name;
        private final List<PipelineStep> steps = new ArrayList<>();
        private final Set<Class<?>> initiallyAvailable = new LinkedHashSet<>();

        private PipelineBuilder(String name) { this.name = name; }

        public PipelineBuilder initiallyAvailable(Class<?>... types) {
            Collections.addAll(initiallyAvailable, types);
            return this;
        }

        public PipelineBuilder step(PipelineStep step) {
            steps.add(step);
            return this;
        }

        public Pipeline build() {
            // Validate requires/produces chain
            var errors = new ArrayList<String>();
            var available = new LinkedHashSet<>(initiallyAvailable);
            for (var step : steps) {
                for (var req : step.requires()) {
                    if (!available.contains(req)) {
                        errors.add("Step '" + step.name() + "' requires " + req.getSimpleName() + " but it may not be available");
                    }
                }
                available.addAll(step.produces());
            }
            if (!errors.isEmpty()) {
                throw new FlowException("INVALID_PIPELINE",
                        "Pipeline '" + name + "' has " + errors.size() + " error(s):\n  - " + String.join("\n  - ", errors));
            }
            return new Pipeline(name, steps, initiallyAvailable);
        }
    }
}
