# tramli: Definition-Time Validated Constrained Flow Engine with Data-Flow Contracts

> v2 — DGE 査読 (G1-G7, G12) 反映

## Abstract

State machine libraries are widely used for managing complex application workflows, yet most defer validation to runtime, leaving structural errors — unreachable states, data dependency mismatches, infinite transition loops — to be discovered in production. We present **tramli**, an embeddable flow engine that enforces 8 structural well-formedness checks at **definition time** (when `build()` is called on a flow definition), introduces **requires/produces contracts** on state processors for static data-flow verification, and provides **DataFlowGraph** analysis for dependency visualization, dead data detection, and migration planning. tramli is implemented as a zero-dependency library in Java, TypeScript, and Rust with a shared test suite across all three languages. We compare tramli against 3 primary competitors (XState, Spring Statemachine, statig) and position it within the state machine theory landscape from Harel Statecharts to modern typestate approaches.

---

## 1. Introduction

### 1.1 The Problem

Modern applications increasingly rely on multi-step workflows: authentication flows, payment processing, deployment orchestration, approval chains. These workflows are naturally modeled as state machines, where each state represents a point in the process and transitions represent the progression between states.

However, most state machine implementations suffer from a fundamental gap: **structural correctness is only discoverable at runtime.** A developer can define a state that is unreachable from any initial state, create a circular chain of automatic transitions that loops infinitely, or reference data that was never produced by a prior step — and none of these errors surface until the code executes in production.

This gap is particularly dangerous when:
- **LLMs generate state machine code** — they hallucinate valid-looking but structurally broken definitions
- **Teams modify flows incrementally** — each change is locally correct but globally breaks invariants
- **Flows span multiple services or languages** — consistency across implementations is hard to verify

### 1.2 Our Contribution

tramli addresses these problems through three mechanisms:

1. **Definition-time well-formedness checks**: When a flow definition is constructed, `build()` verifies 8 structural invariants before the flow can execute. This is not formal verification (model checking) — it is a focused set of structural checks that catch the most common and dangerous errors without requiring external tools. Broken definitions fail fast with actionable error messages.

2. **requires/produces contracts**: Each processor (the unit of business logic) declares what data it needs and what data it provides. These declarations are verified across all paths in the flow graph at definition time, eliminating "data not found" runtime errors. This is a specialization of definition-use analysis from classical data-flow theory, applied at the type level rather than the variable level.

3. **DataFlowGraph analysis**: A derived graph that answers questions about data lifecycle — where is a type first produced? Where is it last consumed? What data is dead (produced but never consumed)? — enabling both optimization and migration planning.

### 1.3 Scope and Non-Goals

tramli is **not** a Statechart implementation (Harel, 1987). It does not support orthogonal regions, history states, or SCXML compliance. It is **not** a formal verification tool — it cannot prove arbitrary temporal logic properties. It is **not** a workflow engine — it has no built-in durability, distribution, or retry infrastructure (cf. Temporal.io).

tramli is a **focused, embeddable library** for applications where the dominant concern is: "is my flow definition structurally sound and data-flow consistent?"

---

## 2. Background and Related Work

### 2.1 Theoretical Foundations

**Harel Statecharts (1987)** introduced hierarchical states, orthogonal regions, and history states as extensions to flat finite state machines. UML State Machines and SCXML formalized these concepts into standards. tramli intentionally omits these features — it models flows as flat state graphs with three transition types (Auto, External, Branch), gaining simplicity at the cost of expressiveness. Specifically, orthogonal regions (concurrent state) and history states (state memory) are outside tramli's model. This restricts tramli to sequential, non-concurrent workflows, which covers the majority of business process flows (authentication, payment, approval) but not concurrent protocol modeling.

**Extended Finite State Machines (EFSMs)** augment FSMs with variables and guards on transitions. Data-flow analysis of EFSMs (cf. Cheng & Krishnakumar, 1993) applies classical definition-use analysis to track variable assignments and references across state transitions. tramli's requires/produces contracts are a **specialization of EFSM data-flow analysis**: instead of tracking individual variables, tramli tracks data types (Class keys). This coarser granularity trades precision for simplicity — a processor that declares `requires(OrderRequest.class)` does not specify which fields of OrderRequest it uses. The benefit is that contracts are trivially declared and verified without complex pointer analysis.

**Typestate analysis** (Strom & Yemini, 1986) tracks object state through program analysis, ensuring operations are only invoked when the object is in a valid state. Aldrich et al. (2009, 2014) extended this to Typestate-Oriented Programming. In Rust, the **typestate pattern** (Cliffle 2020, Hoverbear 2016) encodes states as types, making invalid transitions compile errors. This provides a strictly stronger guarantee than tramli's definition-time checks — a Rust typestate FSM cannot represent an invalid transition in any program, while tramli can represent one that fails at `build()`. However, typestate approaches do not address data-flow contracts between processing steps, and they cannot model flows where state is dynamically loaded from persistence (the type must be known at compile time).

### 2.2 State Machine Libraries

**XState v5** (~29,400 GitHub stars) is the dominant TypeScript state machine library, implementing full SCXML-compliant statecharts with an actor model. XState takes a design philosophy of **maximum expressiveness**: developers have full statechart power, including parallel states, history, and invocable actors. XState's "always" (eventless) transitions are conceptually similar to tramli's auto-chain. XState v5 provides TypeScript generic typing for context, offering compile-time type safety for data access. The key philosophical difference: **XState trusts the developer to use statechart power correctly; tramli constrains the developer to prevent structural errors.** Neither approach is inherently superior — they reflect different trade-offs between expressiveness and safety.

**Spring Statemachine** (~1,660 stars) provides deep Spring ecosystem integration with hierarchical states, orthogonal regions, and distributed coordination via Zookeeper. It is a rich framework with runtime-only validation.

**statig** (~769 stars) leverages Rust's type system for compile-time transition validation with no_std/no_alloc support. It provides superstate hierarchy but no data-flow contracts.

### 2.3 Workflow Engines

Temporal.io (~19,400 stars) and AWS Step Functions solve a fundamentally different problem: **durable, distributed execution** over long time spans (minutes to years). They are infrastructure services, not embeddable libraries. tramli and Temporal occupy different architectural layers — tramli defines flow structure within an application process, while Temporal orchestrates across processes and machines. Comparing them on a single axis would be misleading.

---

## 3. Design

### 3.1 Core Concepts

tramli has 8 composable building blocks:

| Concept | Role |
|---|---|
| **FlowState** | Enum of all possible states. Each state declares whether it is initial or terminal. |
| **StateProcessor** | Business logic for one transition. Declares `requires()` and `produces()`. |
| **TransitionGuard** | Pure validation function for external events. Returns Accepted/Rejected/Expired. |
| **BranchProcessor** | Conditional routing — returns a label that maps to a target state. |
| **FlowContext** | Type-safe data accumulator keyed by `Class<?>` (Java), `TypeId` (Rust), or string key (TS). |
| **FlowDefinition** | Immutable, validated description of all states, transitions, and processors. |
| **FlowEngine** | ~120-line orchestrator. Zero business logic. Drives auto-chain, guard validation, branching. |
| **FlowStore** | Pluggable persistence interface (4 methods). |

### 3.2 Three Transition Types

| Type | Trigger | Use Case |
|---|---|---|
| **Auto** | Previous transition completed | Internal processing steps |
| **External** | Outside event (HTTP request, webhook) | User action, callback |
| **Branch** | BranchProcessor returns label | Conditional routing |

Auto and Branch transitions form a DAG — enforced at definition time. External transitions pause the flow until an event arrives.

### 3.3 Auto-Chain

When an External transition's guard passes, the engine continues firing Auto and Branch transitions until it reaches another External transition or a terminal state:

```
HTTP callback arrives
  → External: REDIRECTED → CALLBACK_RECEIVED     (guard validates)
  → Auto:     CALLBACK_RECEIVED → TOKEN_EXCHANGED (processor executes)
  → Auto:     TOKEN_EXCHANGED → USER_RESOLVED     (processor executes)
  → Branch:   USER_RESOLVED → COMPLETE            (branch decides)
  (terminal — flow complete)
```

Fig. 1: OIDC Authentication Flow (generated by `MermaidGenerator.generate(definition)`)

```mermaid
stateDiagram-v2
    [*] --> INIT
    INIT --> REDIRECTED : OidcInitProcessor
    REDIRECTED --> CALLBACK_RECEIVED : [OidcCallbackGuard]
    CALLBACK_RECEIVED --> TOKEN_EXCHANGED : OidcTokenExchangeProcessor
    TOKEN_EXCHANGED --> USER_RESOLVED : UserResolveProcessor
    USER_RESOLVED --> RISK_CHECKED : RiskCheckProcessor
    RISK_CHECKED --> COMPLETE : RiskAndMfaBranch
    RISK_CHECKED --> COMPLETE_MFA_PENDING : RiskAndMfaBranch
    RISK_CHECKED --> BLOCKED : RiskAndMfaBranch
    RETRIABLE_ERROR --> INIT : RetryProcessor
    COMPLETE --> [*]
    COMPLETE_MFA_PENDING --> [*]
    BLOCKED --> [*]
    TERMINAL_ERROR --> [*]
```

Safety: maximum chain depth is 10. The DAG invariant (§3.5, check #3) prevents infinite auto-chain loops.

### 3.4 requires/produces Contracts

Each StateProcessor and TransitionGuard declares:
- `requires()`: the set of data types it needs from FlowContext
- `produces()`: the set of data types it adds to FlowContext

```java
public interface StateProcessor {
    String name();
    Set<Class<?>> requires();
    Set<Class<?>> produces();
    void process(FlowContext ctx) throws FlowException;
}
```

At definition time, tramli walks all paths from the initial state and verifies that every processor's `requires()` is satisfied by the `produces()` of prior processors (or `initiallyAvailable` data). This is a forward data-flow analysis over the state graph.

**Important limitation**: requires/produces contracts verify *declarations*, not *implementations*. If a processor declares `produces(Foo.class)` but its `process()` method does not call `ctx.put(Foo.class, ...)`, the error will surface at runtime when a downstream processor calls `ctx.get(Foo.class)`. This is a well-formedness check, not formal verification.

### 3.5 Definition-Time 8-Item Validation

`build()` executes 8 structural well-formedness checks. Any failure produces an actionable error message. These checks run in **O(|V| + |E|)** time (where |V| = number of states, |E| = number of transitions), as each check is a DFS or BFS traversal of the state graph. For the requires/produces check, path merging via set intersection prevents exponential blowup — at each state, the available-type set is the intersection of all incoming paths, ensuring conservative (sound) but not complete verification. False positives are possible (reporting a missing requirement on an infeasible path); false negatives (missing a real deficiency) are not.

| # | Check | Prevents | Algorithm |
|---|---|---|---|
| 1 | All non-terminal states reachable from initial | Dead states | BFS from initial |
| 2 | Path from initial to at least one terminal | Flows that can never complete | DFS |
| 3 | Auto/Branch transitions form a DAG | Infinite auto-chain loops | DFS cycle detection |
| 4 | At most one External transition per state | Ambiguous event waiting | Linear scan |
| 5 | All Branch targets are defined states | Undefined branch destinations | Linear scan |
| 6 | requires/produces chain integrity | Runtime "data not found" | DFS with set intersection |
| 7 | No transitions from terminal states | Non-terminal terminals | Linear scan |
| 8 | Exactly one initial state exists | Missing/ambiguous start | Linear scan |

Additionally: Auto/External conflict detection and SubFlow exit completeness.

### 3.6 DataFlowGraph

Built as a byproduct of `build()`, the DataFlowGraph provides:

- `availableAt(state)`: types available in context at a given state
- `producersOf(type)` / `consumersOf(type)`: which processors produce/consume a given type
- `deadData()`: types that are produced but never consumed
- `lifetime(type)`: first produced state → last consumed state
- `pruningHints()`: per-state suggestions for removing data no longer needed
- `toMermaid()`: data-flow diagram generation

Fig. 2: Data-Flow Graph (conceptual)

```mermaid
graph LR
    OidcRequest -->|initiallyAvailable| OidcInitProcessor
    OidcInitProcessor -->|produces| OidcRedirect
    OidcRedirect --> OidcCallbackGuard
    OidcCallbackGuard -->|produces| OidcCallback
    OidcCallback --> OidcTokenExchangeProcessor
    OidcTokenExchangeProcessor -->|produces| OidcTokens
    OidcTokens --> UserResolveProcessor
    UserResolveProcessor -->|produces| ResolvedUser
    ResolvedUser --> RiskAndMfaBranch
```

### 3.7 Sub-Flow Composition

Flows can be composed hierarchically. A parent flow can embed a child FlowDefinition at a state. The parent's FlowContext is **shared** with the child — the child inherits all data available at the embedding state, and data produced by child processors is available to the parent after the sub-flow completes. Maximum nesting depth is 3.

Definition-time validation ensures all terminal states of the child flow are mapped to parent states via `onExit()`.

---

## 4. Implementation

### 4.1 Three-Language Monorepo

tramli is implemented in Java (21+), TypeScript (Node 18+), and Rust (1.75+) within a single repository. All three implementations:

- Share the same FlowDefinition DSL structure
- Implement the same 8-item validation
- Generate identical Mermaid diagrams
- Pass a shared test suite (`shared-tests/`, currently 42 scenarios)

Zero external dependencies in all three languages. Jackson (Java) is optional, for JSONB serialization only.

The shared test suite provides **empirical** (not formal) evidence of cross-language semantic equivalence. A formal specification of tramli's semantics is future work.

### 4.2 Performance

The state machine overhead is negligible in I/O-bound applications:

```
Per transition:     ~300-500ns (enum comparison + HashMap lookup)
5-transition flow:  ~2μs total

build() validation (OIDC flow, 9 states, 11 transitions):
  Java:   ~0.3ms
  TS:     ~0.5ms
  Rust:   ~0.1ms

Context:
  DB INSERT:        1-5ms
  HTTP roundtrip:   50-500ms
  OAuth exchange:   200-500ms
```

build() is called once per flow definition (typically at application startup), so its cost is amortized across all flow executions.

---

## 5. Evaluation

### 5.1 Production Deployment: volta-auth-proxy

volta-auth-proxy is a multi-tenant identity gateway managing 4 authentication flows:

| Flow | States | Processors | Guards | Branches |
|---|---|---|---|---|
| OIDC Login | 9 | 5 | 1 | 1 |
| Passkey Login | 6 | 3 | 1 | 0 |
| MFA Verification | 4 | 1 | 1 | 0 |
| Invitation | 6 | 2 | 1 | 1 |

Migration from a custom fork to the tramli library:
- **13 core engine files deleted** (replaced by tramli dependency)
- **~40 volta-specific files updated** (import changes only)
- **2 API adaptations** (FlowInstance.restore() for persistence, FlowException factory)
- **All existing tests passed** without logic changes

### 5.2 Errors Caught by Definition-Time Validation

During volta-auth-proxy development, `build()` caught the following classes of errors:

1. **Unreachable state**: A RETRY_PENDING state was added but no transition led to it. build() check #1 reported it immediately.
2. **Missing requires**: A new processor was added that required `FraudScore.class`, but the processor that produces it was on a different branch path. build() check #6 identified the gap.
3. **Auto/External conflict**: A state was given both an auto transition and an external transition. The auto would shadow the external, making it unreachable.

### 5.3 Competitive Comparison

We compare against 3 primary competitors. Each represents a different design philosophy:

| Aspect | XState v5 | Spring SM | statig (Rust) | **tramli** |
|---|---|---|---|---|
| **Philosophy** | Maximum expressiveness (full statecharts) | Framework integration | Compile-time type safety | Definition-time structural safety |
| **Validation timing** | Runtime | Runtime | Compile-time (type system) | Definition-time (build()) |
| **Data contracts** | TS generics for context type | None | None | requires/produces |
| **Data-flow analysis** | None | None | None | DataFlowGraph |
| **Transition safety** | Developer responsibility | Developer responsibility | Type system enforced | DAG check + 8-item suite |
| **Expressiveness** | Statecharts (parallel, history) | Statecharts + regions | Superstates | Flat states + Sub-flow |
| **Languages** | TypeScript | Java | Rust | Java, TS, Rust |
| **Dependencies** | ~17KB gzipped | Spring ecosystem | Zero (no_std) | Zero |

**Trade-off acknowledgment**: XState's expressiveness allows modeling concurrent protocols that tramli cannot represent. statig's compile-time guarantees are strictly stronger than tramli's definition-time checks for transition validity (an invalid transition in statig is a compile error; in tramli it is a build() runtime exception). Spring SM's ecosystem integration provides persistence, monitoring, and distributed coordination out of the box. tramli trades expressiveness and ecosystem richness for focused structural and data-flow safety in a lightweight, cross-language package.

### 5.4 Threats to Validity

**External validity**: Production deployment evidence comes from a single project (volta-auth-proxy). The 4 flows are all authentication-related, which may not represent the full diversity of state machine use cases (e.g., game logic, protocol implementations).

**Internal validity**: Cross-language equivalence is verified empirically via 42 shared test scenarios, not by formal proof. Edge cases in language-specific behavior (e.g., floating-point handling, Unicode in state names) could differ without being caught by current tests.

**Construct validity**: The competitive comparison selects 3 primary competitors based on GitHub stars and ecosystem representation. Other libraries (squirrel-foundation, Robot3, rust-fsm, etc.) exist but were excluded from the main comparison to avoid diluting the analysis. Full data is available in supplementary materials.

---

## 6. Discussion

### 6.1 Definition-Time vs. Compile-Time vs. Runtime

It is important to distinguish three levels of validation:

| Level | When | What | Examples |
|---|---|---|---|
| **Compile-time** | Compiler runs | Type errors, invalid transitions (typestate) | Rust statig, statum |
| **Definition-time** | `build()` called | Structural well-formedness, data-flow contracts | tramli |
| **Runtime** | Flow executes | Semantic errors, I/O failures, guard rejections | XState, Spring SM |

tramli's definition-time checks are weaker than compile-time guarantees (a program can construct an invalid FlowDefinition and only discover the error when build() is called) but stronger than runtime-only validation (errors surface before any flow instance executes). This middle ground is deliberate: compile-time approaches (typestate) cannot model dynamically-loaded state (from database), while runtime-only approaches discover errors too late.

### 6.2 Why LLMs Need Definition-Time Validation

LLMs can generate state machine definitions, but they hallucinate. A generated flow might reference a nonexistent state, create an auto-chain cycle, or forget to produce data that a downstream processor requires.

With runtime-only validation, these errors surface in production. With tramli's `build()`, they fail immediately with a clear error message, enabling a tight feedback loop: generate → build → fix → iterate.

The requires/produces contract is particularly valuable: it gives the LLM a type-safe "API" for each processor, making it harder to generate inconsistent data flows.

### 6.3 Cross-Language Migration

tramli's 3-language implementation enables a migration path: prototype in TypeScript, harden in Java, optimize in Rust — with the same flow definitions and shared tests verifying behavioral equivalence.

The requires/produces contracts serve as a **migration spec**: when porting a processor from Java to Rust, the contract tells you exactly what data types to accept and produce, and the shared test suite verifies the result.

### 6.4 Limitations

- **Not formal verification**: build-time checks are structural well-formedness checks, not model checking. tramli cannot verify arbitrary temporal logic properties (cf. SPIN, TLA+, Alloy). It catches 8 specific categories of structural errors.
- **No runtime enforcement of produces**: if a processor declares `produces(Foo.class)` but doesn't actually produce it, the error occurs downstream at runtime.
- **Enum-based states**: states must be known at definition time. Dynamic state creation is not supported.
- **No concurrent states**: orthogonal regions (Harel Statecharts) are not modeled. Flows are sequential.
- **Single-writer assumption**: FlowEngine assumes single-threaded access per flow instance. Concurrent access requires external coordination (e.g., SELECT FOR UPDATE in FlowStore).

---

## 7. Future Work

1. **Shared Test Scenarios (YAML)**: Language-agnostic test scenario files for cross-language migration verification.
2. **FlowStore Service**: A wire protocol (gRPC/HTTP) for language-agnostic persistence, eliminating per-language FlowStore reimplementation.
3. **Formal semantics specification**: A formal definition of tramli's execution semantics to strengthen cross-language equivalence beyond empirical testing.
4. **DataFlowGraph extensions**: Migration order planning, skeleton code generation, and external dependency annotation.

---

## 8. Conclusion

tramli demonstrates that state machine libraries can provide significantly stronger structural guarantees without sacrificing simplicity. The definition-time 8-item validation catches structural errors before any flow executes. The requires/produces contract system brings data-flow safety to state machines — a combination not found in any surveyed competitor. The DataFlowGraph bridges static analysis with practical tooling.

These mechanisms are not formal verification. They do not replace model checkers or theorem provers. What they provide is a **practical middle ground**: stronger than runtime-only validation, lighter than formal methods, and consistent across three programming languages.

In an era where LLMs generate code and teams work across language boundaries, this middle ground addresses a real engineering need: catching the structural errors that are most common and most dangerous, at the earliest possible moment, with zero additional tooling.

---

## References

1. Strom, R. E., & Yemini, S. (1986). Typestate: A programming language concept for enhancing software reliability. IEEE TSE, 12(1).
2. Harel, D. (1987). Statecharts: A visual formalism for complex systems. Science of Computer Programming.
3. Cheng, K. T., & Krishnakumar, A. S. (1993). Automatic functional test generation using the extended finite state machine model. DAC.
4. Aldrich, J., Sunshine, J., & Saini, D. (2009). Typestate-Oriented Programming. OOPSLA.
5. Aldrich, J., et al. (2014). Foundations of Typestate-Oriented Programming. ACM TOPLAS.
6. Cliffle, C. (2020). The Typestate Pattern in Rust. https://cliffle.com/blog/rust-typestate/
7. Hoverbear, A. (2016). Pretty State Machine Patterns in Rust. https://hoverbear.org/blog/rust-state-machine-pattern/
8. XState v5 Documentation. https://stately.ai/docs
9. Spring Statemachine Reference. https://docs.spring.io/spring-statemachine/
10. Incremental Dead State Detection in Logarithmic Time. (2023). arXiv:2301.05308.
