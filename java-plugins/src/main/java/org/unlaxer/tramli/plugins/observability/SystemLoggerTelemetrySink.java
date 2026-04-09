package org.unlaxer.tramli.plugins.observability;

/**
 * TelemetrySink backed by {@link System.Logger} (JDK built-in).
 * Uses INFO level for transition/state/guard events and WARNING for errors.
 */
public final class SystemLoggerTelemetrySink implements TelemetrySink {
    private final System.Logger logger;

    public SystemLoggerTelemetrySink(String loggerName) {
        this.logger = System.getLogger(loggerName);
    }

    public SystemLoggerTelemetrySink() {
        this("tramli.observability");
    }

    @Override
    public void emit(TelemetryEvent event) {
        var level = "error".equals(event.type()) ? System.Logger.Level.WARNING : System.Logger.Level.INFO;
        logger.log(level, "[{0}] flow={1} ({2}) {3} ({4}\u00b5s)",
                event.type(), event.flowId(), event.flowName(), event.message(), event.durationMicros());
    }
}
