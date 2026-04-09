// ── API framework ──
export { PluginReport } from './api/types.js';
export type {
  FindingLocation, FindingEntry,
  PluginKind, PluginDescriptor, FlowPlugin,
  AnalysisPlugin, StorePlugin, EnginePlugin,
  RuntimeAdapterPlugin, GenerationPlugin,
  DocumentationPlugin as DocumentationPluginSPI,
} from './api/types.js';
export { PluginRegistry } from './api/plugin-registry.js';

// ── Audit ──
export { AuditStorePlugin } from './audit/audit-store-plugin.js';
export { AuditingFlowStore } from './audit/auditing-flow-store.js';
export type { AuditedTransitionRecord } from './audit/auditing-flow-store.js';

// ── Event Store ──
export { EventLogStorePlugin } from './eventstore/event-log-store-plugin.js';
export { EventLogStoreDecorator } from './eventstore/event-log-store-decorator.js';
export { ReplayService, ProjectionReplayService } from './eventstore/replay-service.js';
export { CompensationService } from './eventstore/compensation-service.js';
export type {
  VersionedTransitionEvent, CompensationPlan,
  CompensationResolver, ProjectionReducer,
} from './eventstore/types.js';

// ── Observability ──
export { ObservabilityEnginePlugin, InMemoryTelemetrySink } from './observability/observability-plugin.js';
export type { TelemetryEvent, TelemetrySink } from './observability/observability-plugin.js';

// ── Rich Resume ──
export { RichResumeExecutor, RichResumeRuntimePlugin } from './resume/rich-resume.js';
export type { RichResumeStatus, RichResumeResult } from './resume/rich-resume.js';

// ── Idempotency ──
export { InMemoryIdempotencyRegistry } from './idempotency/in-memory-idempotency-registry.js';
export { IdempotentRichResumeExecutor } from './idempotency/idempotent-rich-resume-executor.js';
export { IdempotencyRuntimePlugin } from './idempotency/idempotency-runtime-plugin.js';
export type { CommandEnvelope, IdempotencyRegistry } from './idempotency/types.js';

// ── Hierarchy ──
export { EntryExitCompiler } from './hierarchy/entry-exit-compiler.js';
export { HierarchyCodeGenerator } from './hierarchy/hierarchy-code-generator.js';
export { HierarchyGenerationPlugin } from './hierarchy/hierarchy-generation-plugin.js';
export type {
  HierarchicalStateSpec, HierarchicalTransitionSpec,
  HierarchicalFlowSpec,
} from './hierarchy/types.js';
export { stateSpec, transitionSpec, flowSpec } from './hierarchy/types.js';

// ── Diagram ──
export { DiagramPlugin } from './diagram/diagram-plugin.js';
export { DiagramGenerationPlugin } from './diagram/diagram-generation-plugin.js';
export type { DiagramBundle } from './diagram/types.js';

// ── Documentation ──
export { DocumentationPlugin } from './docs/documentation-plugin.js';
export { FlowDocumentationPlugin } from './docs/flow-documentation-plugin.js';

// ── Lint ──
export { PolicyLintPlugin } from './lint/policy-lint-plugin.js';
export { allDefaultPolicies } from './lint/default-flow-policies.js';
export type { FlowPolicy } from './lint/types.js';

// ── Testing ──
export { ScenarioTestPlugin } from './testing/scenario-test-plugin.js';
export type { TestFramework } from './testing/scenario-test-plugin.js';
export { ScenarioGenerationPlugin } from './testing/scenario-generation-plugin.js';
export type { FlowScenario, FlowTestPlan, ScenarioKind } from './testing/types.js';

// ── SubFlow ──
export { GuaranteedSubflowValidator } from './subflow/guaranteed-subflow-validator.js';
