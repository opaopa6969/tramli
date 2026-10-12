[日本語版](README-ja.md)

# tramli documentation

This page lists every document under `docs/` and who it is for. If you are new to tramli, start with the [repository README](../README.md#why-tramli-exists): it explains the problem tramli solves, how it compares to other libraries, and when not to use it.

## Suggested reading order

1. [README — Why tramli exists](../README.md#why-tramli-exists) — the problem, alternatives, and a before/after example
2. [README — Quick Start](../README.md#quick-start) — define states, Processors, and a flow, then run it
3. [Real-world example: OIDC login flow](example-oidc-auth-flow.md) — a complete flow with 9 states and 5 Processors
4. [API Cookbook](api-cookbook.md) — look up a method when you need it
5. [Patterns](#patterns) — when you need persistence, long-running flows, or I/O separation

## Guides for users

| Document | Read it when you want to… |
|----------|---------------------------|
| [Why tramli Works — The Attention Budget](why-tramli-works.md) ([日本語](why-tramli-works-attention-budget-ja.md)) | understand why explicit data contracts narrow what you must read to make a change |
| [Checking State-Machine Data Dependencies Before Execution](article-build-time-dataflow.md) | compare tramli with XState, Spring Statemachine, and statig, including tramli's limits |
| [Example: OIDC login flow](example-oidc-auth-flow.md) ([日本語](example-oidc-auth-flow-ja.md)) | see how a realistic flow is broken into states and Processors |
| [API Cookbook](api-cookbook.md) ([日本語](api-cookbook-ja.md)) | find a usage example for a specific API |
| [Language Guide](language-guide.md) ([日本語](language-guide-ja.md)) | choose between the Java, TypeScript, and Rust versions and learn their differences |
| [Language Compatibility Matrix](language-compatibility-matrix.md) | evaluate other languages as port candidates |
| [Async Integration](async-integration.md) | call HTTP APIs, databases, or other async I/O from a flow |
| [API Stability](api-stability.md) | decide which APIs are safe to depend on across upgrades |
| [Plugin Guide](plugin-guide.md) ([日本語](plugin-guide-ja.md)) | look up what each plugin solves and how to configure it |
| [Plugin Tutorial](tutorial-plugins.md) ([日本語](tutorial-plugins-ja.md)) | try the plugins step by step in a runnable example |

## Patterns

| Pattern | Problem it addresses |
|---------|----------------------|
| [Custom FlowStore](patterns/custom-flowstore.md) | storing flow instances somewhere other than memory |
| [FlowStore schema](patterns/flowstore-schema.md) | persisting, restoring, and concurrently updating flows in a database |
| [I/O separation](patterns/io-separation.md) | keeping network and database calls out of transition logic |
| [Long-lived flows](patterns/long-lived-flows.md) ([日本語](patterns/long-lived-flows-ja.md)) | flows that last days, and changing a flow definition while instances exist |
| [Non-blocking sink](patterns/non-blocking-sink.md) | sending logs or events without slowing down transitions |

## Specifications and research

These define behavior precisely. They are useful when implementing a port, contributing to the core, or checking an edge case.

| Document | Contents |
|----------|----------|
| [FlowContext spec](specs/flow-context-spec.md) | how data is stored and read during a flow |
| [FlowDefinition spec](specs/flow-definition-spec.md) | the builder and the build-time validation rules |
| [FlowEngine spec](specs/flow-engine-spec.md) | execution, auto-chaining, errors, and resume behavior |
| [Shared test scenarios](specs/shared-test-scenarios.md) | scenarios that all three implementations must pass |
| [Paper: tramli, a constrained flow engine](paper-tramli-constrained-flow-engine.md) | the design, validation model, and comparison with related work |

## For AI coding agents

[`skills/`](skills/) contains task instructions for AI agents: analyzing data flow, choosing a flow pattern, generating diagrams and skeletons, and validating flows.

## Internal records

The following documents record project history, feedback from specific adopters, and planning notes at a point in time. They are kept as-is for traceability and may describe older APIs or assume project context. **You do not need them to use tramli.**

| Document | What it records |
|----------|-----------------|
| [ROADMAP](ROADMAP.md), [backlog](backlog.md) | planned and completed work |
| [session-handoff-2026-04-09*.md](session-handoff-2026-04-09.md) | hand-off notes between development sessions |
| [feedback/](feedback/) | feedback from integrating tramli into volta-auth-proxy |
| [review-volta-gateway](review-volta-gateway.md) ([日本語](review-volta-gateway-ja.md)) | a review written while using tramli-rust in volta-gateway |
| [proposal-cross-language-portability](proposal-cross-language-portability.md), [request-flowinstance-version-api](request-flowinstance-version-api.md) | feature proposals and requests |
| [tramli_plugin_handoff](tramli_plugin_handoff.md) | the plan for integrating the Java plugin pack |
| [market/](market/) | a survey of comparable libraries (dated) |
| [mcp/](mcp/) | design and status of serving tramli skills over MCP |
