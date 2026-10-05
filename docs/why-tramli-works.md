# Why tramli Works — The Attention Budget

This article is for engineers who need to change one step in a login, payment, or approval flow without tracing the whole application.
It explains how tramli makes data dependencies explicit, what that lets humans and LLMs focus on, and which checks still need tests and review.
No prior knowledge of tramli is required. [日本語版](why-tramli-works-attention-budget-ja.md)

<a id="your-brain-has-a-ram-limit"></a>
<a id="what-procedural-code-does-to-your-budget"></a>

## The pain: a small change requires tracing the whole flow

Suppose a user opens a page that requires login. The application remembers the requested URL, sends the user to a login page, creates a session, and redirects them back. A bug in that sequence can send the user to the default page instead of the page they requested.

Finding the cause means answering several questions: where was the destination assembled, did it survive the login request, and does the final redirect use it? If those answers are scattered across a handler, a form, and a callback, changing the URL-building code also requires tracing its callers and consumers.

Cookie settings and the request's URL scheme may need review too, but they are different questions. Missing a destination and constructing an incorrect destination need different checks. When all this logic lives together, it is easy to overlook one of them.

Here, **attention budget** means the effort spent finding relevant code and keeping its dependencies in mind. It is a design metaphor, not a fixed number of lines a person or model can understand.

## What ordinary refactoring already solves

You can separate URL construction, session creation, and response handling into functions, give their inputs and outputs explicit types, and test them independently. For a short, linear process, that may be enough.

The extra difficulty appears when a process has branches or waits for an external response. A function signature describes one call, but you still need to check whether every route to that call supplies its inputs. A state machine makes the stages and routes explicit. tramli adds declarations that let it check data dependencies across those routes.

<a id="what-tramli-does-to-your-budget"></a>

## How tramli makes the dependencies visible

tramli is a constrained flow engine for Java, TypeScript, and Rust. States are a flat enum. Transitions are Auto (advance automatically), External (wait for an outside event), or Branch (choose a route). A `FlowDefinition` lists the routes; a `StateProcessor` contains the business logic for one transition. Its `requires` declaration lists the data it reads, and `produces` lists the data it promises to provide.

For the login example, the contracts can be described as follows. This is contract notation, not Java syntax; the names describe application data, not built-in tramli types.

```text
// LoginRedirectInit
requires: { RequestOrigin, AuthConfig }
produces: { LoginRedirect }

// SessionCreator
requires: { ResolvedUser, RequestOrigin, AuthConfig }
produces: { SessionCookie, FinalRedirect }
```

`RequestOrigin` holds information about the incoming request, and `AuthConfig` holds login settings. `LoginRedirectInit` uses them to prepare `LoginRedirect`, the data for sending the user to login. `SessionCreator` uses the resolved user and those inputs to produce a session cookie and the final redirect.

These declarations make a useful omission visible: **`SessionCreator` does not declare that it reads `LoginRedirect`.** If it needs a destination stored there, that dependency must be added to its `requires` contract. tramli cannot infer it from the business requirement. Once declared, `build()` can check whether the preceding routes supply that type.

For a Java example using the actual API, see the [order-flow example](article-build-time-dataflow.md#what-if-build-caught-it).

<a id="the-three-guarantees"></a>

## What the tools check, and what they do not

Calling `build()` constructs and validates a flow definition before any flow instance executes. It is a method call, not a compiler phase: a test must call it for the validation to run in CI.

| Question | What tramli checks | What still needs review or tests |
|---|---|---|
| Can this step receive the data it requires? | `build()` checks declared data availability along the flow's paths. | Initial data must actually be supplied, and implementations must honor their declarations. Undeclared reads are not inferred from method bodies. |
| Is this transition structurally valid? | Enum references catch misspelled state names at compilation; `build()` checks structure, including Auto/Branch cycles and outgoing transitions from terminal states. | A declared transition can still be wrong for the business process. |
| Does the diagram match the flow definition? | A Mermaid diagram generated from the definition reflects that definition. | A saved copy must be regenerated after changes; the diagram does not describe every operation inside a Processor. |

The diagram uses the existing Java API, where `authFlow` is the application's flow definition:

```java
String mermaid = MermaidGenerator.generate(authFlow);
```

The [8 build-validation checks](../README.md#8-item-build-validation) cover structure and declared dependencies. They do not establish that a redirect URL has the right value or that a cookie has the right settings. Those remain application behavior to test.

<a id="the-didnt-need-to-read-principle"></a>

## Deciding what to read for a change

For a change to session creation, start with the `FlowDefinition`, the `SessionCreator` contract, its implementation, and its tests. This shows where the step runs and what it exchanges with the rest of the flow.

If the change preserves the meaning of those inputs and outputs, you may be able to keep the review local. If it changes what `FinalRedirect` means, also inspect its consumers. If it changes how `RequestOrigin` is interpreted, inspect its producer and the relevant configuration. A contract helps locate dependencies; it does not make Processors unable to affect one another.

For illustration, a 1,800-line handler might become a 50-line flow definition plus separate Processors. Reading that definition and one 30-line Processor is 80 lines as a starting point. These are example sizes, not a measured reduction in effort or proof that the remaining code is irrelevant. The benefit is knowing where to start and when to expand the review.

<a id="llms-have-the-same-problem-literally"></a>
<a id="why-this-works-for-both-humans-and-ai"></a>

## Why this can also help LLMs

An LLM working on the same change can be given the flow definition, the relevant contracts, and the target implementation and tests. Explicit dependencies reduce how much it must reconstruct from scattered code. Build errors then provide concrete feedback about missing declarations or invalid structure.

This is a reason to expect a more manageable task, not evidence of a particular improvement in model accuracy. Human attention and Transformer attention are not the same mechanism. Standard Transformer attention uses normalized weights; that normalization alone does not imply that adding code uniformly weakens every relevant connection. See [Attention Is All You Need, §3.2](https://arxiv.org/html/1706.03762v7#S3.SS2) for the mechanism.

The practical claim is narrower: **making the relevant inputs, outputs, and routes explicit can reduce the material that a human or LLM must search through, leaving less to overlook.** How much it helps depends on the task, the contracts, and the implementation. Passing `build()` does not establish that generated code is correct.

<a id="summary"></a>

## A review workflow

1. Read the flow definition to locate the step and the routes that reach it.
2. Read the step's contract, implementation, and tests; follow producers or consumers when the change affects the meaning of exchanged data.
3. Compile and call `build()` in tests to check the revised definition, then test the changed behavior and relevant integrations.
4. Regenerate any saved diagrams from the revised definition.

Use this approach when keeping track of data across stages is a recurring maintenance problem. If ordinary function calls already make the dependencies clear, adding flow definitions and contracts may create more work than it saves.
