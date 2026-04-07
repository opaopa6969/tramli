# Why tramli Works — The Attention Budget

You have a budget. Not money — **attention.**

Every time you read code, your brain spends from this budget. Read a variable name: costs a little. Trace where that variable came from, through 3 files and 400 lines: costs a lot. Run out of budget, and you start missing things. Bugs slip in.

This isn't a metaphor. It's how brains actually work, and — surprisingly — it's also how AI language models work. tramli is designed around this single insight.

---

## Your Brain Has a RAM Limit

Try this: remember these numbers.

> 7, 2, 8, 4, 1, 9, 3

Now close your eyes and repeat them.

Most people can hold about 7 items in working memory at once. This has been studied since the 1950s — psychologist George Miller called it "The Magical Number Seven, Plus or Minus Two."

When you read a 500-line function, you're not just reading — you're **holding state in your head.** "Okay, `returnTo` was set on line 38... then on line 167 it's checked but only if `fwdProto` is not null... and `fwdProto` comes from the HTTP header which is set by Traefik, but only if the middleware ran..."

That's way more than 7 items. You've blown your budget. You're going to miss something.

---

## LLMs Have the Same Problem (Literally)

AI language models like Claude and GPT use a mechanism called **attention**. When the model reads your code, every token (roughly, every word or symbol) "looks at" every other token to understand context. This is the core of the Transformer architecture.

Here's the thing: attention has a **fixed budget per layer.** The model distributes its focus across all the tokens in its context window. The more code it has to read, the thinner that attention is spread.

```
  50-line FlowDefinition  → attention is concentrated → model understands deeply
1800-line handler         → attention is diluted       → model misses connections
```

This isn't a design flaw — it's a mathematical property. Attention weights must sum to 1.0 across all positions. More positions = less weight per position = weaker signal for any single connection.

So when an LLM reads a 1800-line procedural handler and misses that `return_to` was set on line 384 but consumed on line 1204, it's not "hallucinating." It's running out of attention budget, just like a human programmer would.

---

## What Procedural Code Does to Your Budget

Here's a real scenario that just happened (names simplified):

```
Line  384:  returnTo = (fwdProto != null ? fwdProto : "http") + "://" + fwdHost + fwdUri
Line  404:  proto = fwdProto != null ? fwdProto : "http"
Line  650:  ctx.cookie("__volta_session", sessionId, ...)  // Secure flag?
Line  890:  ctx.redirect(loginUrl + "?return_to=" + returnTo)  // still available?
Line 1204:  window.location.href = result.redirect_to || '/console/'  // where did return_to go?
```

To find the bug, you need to hold **all** of this in your head simultaneously:

1. Where `returnTo` was created (line 384)
2. What `fwdProto` defaults to when null (line 384 — "http")
3. Where `fwdProto` comes from (Traefik ForwardAuth headers)
4. Whether Traefik passes `X-Forwarded-Proto` (depends on middleware config)
5. Whether the login page preserves `returnTo` through the POST (it doesn't)
6. Whether the cookie has the `Secure` flag (depends on `isSecure()`, which depends on how Traefik connects)

That's 6 facts spread across 800+ lines and 3 different systems. No human and no LLM can reliably hold all of that.

**The result:** An AI agent spent 14 minutes of continuous debugging — SSH-ing into servers, reading configs, patching code, reverting, patching again — chasing these bugs one by one, each fix revealing the next problem. A human would have done the same, just slower.

---

## What tramli Does to Your Budget

tramli restructures the same logic so that each piece **declares what it needs and what it provides:**

```java
// LoginRedirectInit
requires: { RequestOrigin, AuthConfig }
produces: { LoginRedirect }

// SessionCreator
requires: { ResolvedUser, RequestOrigin, AuthConfig }
produces: { SessionCookie, FinalRedirect }
```

Now the same 6 questions have local answers:

| Question | Procedural (read 1800 lines) | tramli (read 1 processor) |
|----------|------------------------------|---------------------------|
| Where does `returnTo` come from? | Trace from line 384 | `LoginRedirectInit.produces(LoginRedirect)` |
| Is `returnTo` available at session creation? | Read lines 384–1204 | `build()` verified it — yes |
| What's the URL scheme? | Trace `fwdProto` through 3 systems | `RequestOrigin.scheme` — one field |
| Does the cookie have `Secure`? | Find line 650, trace `isSecure()` | `SessionCookie.create(origin)` — one method |

**Each question costs 1 item of working memory instead of 6.** You stay within budget. The bug doesn't happen.

---

## The "Didn't Need to Read" Principle

Here's the most counterintuitive insight: **tramli's value isn't in what it makes you read — it's in what it lets you skip.**

In a 1800-line handler, every line is implicit context. Changing line 400 might break line 1200. You can't know without reading everything. So you have to read everything.

In tramli, a `StateProcessor` is a **closed unit.** Its inputs are declared (`requires`). Its outputs are declared (`produces`). If you're fixing `SessionCreator`, you don't need to read `TokenExchange` or `LoginRedirectInit`. They can't affect each other — the compiler and `build()` guarantee it.

```
Procedural:  1800 lines × "might be relevant" = 1800 lines to read
tramli:        50 lines of FlowDefinition + 30 lines of the 1 processor you need = 80 lines to read
```

That's a 95% reduction in attention cost. Not by compressing information — by **proving that 95% of the code is irrelevant to your task.**

---

## Why This Works for Both Humans and AI

The parallel isn't a coincidence. It's structural:

| | Human Brain | LLM Attention |
|---|---|---|
| Capacity | ~7 items in working memory | Fixed attention budget per layer |
| Failure mode | "I forgot that `returnTo` was set 800 lines ago" | Attention weight on line 384 too low to connect to line 1204 |
| What helps | Locality — related things close together | Locality — related tokens close together |
| What hurts | Global dependencies across 1000+ lines | Long-range dependencies dilute attention |

tramli converts **global dependencies** (line 384 affects line 1204) into **local contracts** (`requires`/`produces` on adjacent processors). This helps humans because it fits in working memory. It helps LLMs because the relevant tokens are close together in the context window.

This is why an LLM can safely **generate** tramli code: even if it hallucinates a wrong transition, `build()` rejects it immediately. The feedback loop is: generate → compile → `build()` → fix. No 14-minute debugging sessions. No "SSH into the server and tail the logs."

---

## The Three Guarantees

tramli makes three things **structurally impossible** — not "unlikely" or "caught by tests," but impossible:

**1. Missing data**
```java
// If SessionCreator needs LoginRedirect but nothing produces it,
// build() fails BEFORE any code runs:
//
// "Processor 'SessionCreator' at SESSION_CREATED requires LoginRedirect
//  but it may not be available"
```

**2. Invalid transitions**
```java
// States are an enum. A typo like "COMLETE" is a compile error.
// A cycle in auto-transitions is caught by DAG validation at build().
// A transition from a terminal state is caught at build().
```

**3. Stale diagrams**
```java
// The diagram IS the code. Generated from the same FlowDefinition
// that the engine executes. It can never be out of date.
String mermaid = MermaidGenerator.generate(authFlow);
```

These aren't "best practices." They're **compiler-enforced invariants.** You don't need to spend attention budget remembering them — the toolchain remembers for you.

---

## Summary

| | Without tramli | With tramli |
|---|---|---|
| Attention cost to understand the flow | Read 1800 lines | Read 50-line FlowDefinition |
| Attention cost to change one step | Read everything (might break something) | Read 1 processor (can't break others) |
| "Is `returnTo` available here?" | Trace 800 lines | `build()` already checked |
| Debugging a data-missing bug | 14 minutes of SSH + log reading | `build()` error at compile time |
| Works for humans? | — | ✓ (fits in 7±2 working memory) |
| Works for LLMs? | — | ✓ (fits in attention budget) |

**tramli doesn't make you smarter. It makes the problem smaller — small enough to fit in the attention budget you already have.**

---

*tramli = tramline (路面電車の軌道). Your code runs on rails. You can only go where tracks are laid — and that's exactly why you don't get lost.*
