# tramli-plugin-pack-java (revised)

Java-only plugin pack for tramli, revised to keep the current verification quality of the core while addressing three v1 concerns:

1. **Unified plugin lifecycle API**
   - analysis plugins
   - store plugins
   - engine install plugins
   - runtime adapter plugins
   - generation / documentation plugins
2. **Hierarchy spec is explicit**
   - terminal / initial are declared on `HierarchicalStateSpec`
   - no terminal-name heuristics such as `endsWith("DONE")`
3. **Event-store is Tenure-lite rather than audit-only**
   - append-only transition log
   - compensation log entries
   - snapshot replay
   - projection-based `stateAtVersion`

## Included plugin families

### Analysis
- `PolicyLintPlugin`

### Store
- `AuditStorePlugin`
- `EventLogStorePlugin`

### Engine install
- `ObservabilityEnginePlugin`

### Runtime adapter
- `RichResumeRuntimePlugin`
- `IdempotencyRuntimePlugin`

### Generation / docs
- `DiagramGenerationPlugin`
- `FlowDocumentationPlugin`
- `ScenarioGenerationPlugin`
- `HierarchyGenerationPlugin`

## Notes

- These plugins are implemented as wrappers, generators, validators, and decorators.
- They do **not** change tramli core validator semantics.
- Orthogonal regions are intentionally omitted.
- The hierarchy plugin is implemented as a source generator because current tramli Java definitions are enum-based.
- The event-store plugin is intentionally **Tenure-lite**: it adds durability, compensation hooks, and projection replay, but it does not replace tramli core with full event sourcing.

## Compile smoke example

```bash
javac -d out $(find /path/to/tramli/java/src/main/java -name "*.java") $(find src/main/java -name "*.java") $(find src/test/java -name "*.java")
java -cp out org.unlaxer.tramli.plugins.examples.PluginPackSmoke
```


## Minor v1.1 clarifications

- `RuntimeAdapterPlugin` is now a dedicated plugin kind (`RUNTIME_ADAPTER`) and can be bound through `PluginRegistry.bindRuntimeAdapters(...)`.
- `ReplayService.stateAtVersion(...)` currently assumes each `TRANSITION` event stores a **full snapshot** for that version. If the event log changes to diff-only storage later, replay must switch to a reducer/fold strategy.
