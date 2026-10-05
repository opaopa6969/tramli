# I/O Separation Patterns

This guide is for developers whose processors call HTTP services, databases, or files.
It explains three ways to separate those calls from data transformation, so processors are easier to test and port between Java, TypeScript, and Rust.

## Problem: testing a transformation requires a real service

Suppose a login step exchanges an authorization code for tokens, then validates the returned data. If both operations live in one processor, testing validation also requires setting up or replacing the HTTP client. Moving the flow to another language means rewriting both the client integration and the validation logic together.

## What happens with the straightforward approach?

Calling the client directly from `process()` is easy to start with. As more processors do this, each test needs to account for network failures as well as business rules. A slow I/O call also delays the rest of the automatic transition sequence.

Constructor injection can make a client replaceable in tests. It does not by itself separate the transformation from the code that calls the client. Choose how much separation you need before adding more interfaces.

## The pattern: choose where I/O belongs

An External transition waits for data from outside the engine. An Auto transition runs a processor; the engine continues through Auto and Branch transitions until it must wait again or the flow ends. This sequence is the auto-chain.

| Situation | Approach | Trade-off |
|---|---|---|
| I/O happens one operation at a time, such as an OAuth callback or payment webhook | Perform I/O outside the engine and resume an External transition | Keeps processors as pure transformations, but adds External boundaries |
| A processor coordinates multiple I/O calls through injected dependencies | Call an application interface, or port, implemented by an adapter | Makes I/O replaceable; both the port and processor still need work when porting |
| A large flow has complex transformation logic, typically 10+ processors | Separate transformation from the service binding that calls I/O | Isolates transformation tests and porting work, but adds a second layer |

The port, adapter, `DataProcessor`, and service binding below are application code. They are not additional tramli APIs. Processors still declare their input and output data with `requires` and `produces`.

## Code examples

These are excerpts: domain types, service implementations, and unrelated processor methods are omitted. The examples use an OpenID Connect (OIDC) login, where a callback supplies a code that is exchanged for tokens.

### Pattern 1: External + Auto-Chain (Recommended)

Perform I/O in the request handler, then pass its result to `resumeAndExecute()`. The processor only transforms that result. This is the recommended starting point when each I/O result gives the flow a natural place to resume.

```java
// I/O outside the engine
var tokens = oidcService.exchangeCode(callback);
engine.resumeAndExecute(flowId, def, Map.of(OidcTokens.class, tokens));

// The processor only transforms data
class TokenValidationProcessor implements StateProcessor {
    @Override public Set<Class<?>> requires() { return Set.of(OidcTokens.class); }
    @Override public Set<Class<?>> produces() { return Set.of(ValidatedTokens.class); }
    @Override public void process(FlowContext ctx) {
        var tokens = ctx.get(OidcTokens.class);
        ctx.put(ValidatedTokens.class, validate(tokens));  // Pure transformation
    }
}
```

```typescript
// I/O outside the engine
const tokens = await oidcService.exchangeCode(callback);
await engine.resumeAndExecute(flowId, def, new Map([['OidcTokens', tokens]]));
```

```rust
// I/O outside the engine
let tokens = oidc_service.exchange_code(&callback).await?;
engine.resume_and_execute(&flow_id, vec![(TypeId::of::<OidcTokens>(), Box::new(tokens))]);
```

The processor can be tested with token data directly. The cost is that several I/O operations in one request require several External boundaries and split the auto-chain.

### Pattern 2: Port/Adapter — Constructor Injection (Good)

Define an interface for the operation the processor needs. Inject a real adapter in the application and a mock implementation in tests. This is the part of hexagonal architecture relevant here: business logic calls an interface rather than a particular client library.

```java
interface TokenExchangePort {
    OidcTokens exchange(String code, String redirectUri);
}

class OidcTokenExchangeProcessor implements StateProcessor {
    private final TokenExchangePort port;  // Constructor injection
    OidcTokenExchangeProcessor(TokenExchangePort port) { this.port = port; }

    @Override public void process(FlowContext ctx) {
        var callback = ctx.get(OidcCallback.class);
        var tokens = port.exchange(callback.code(), callback.redirectUri());
        ctx.put(OidcTokens.class, tokens);
    }
}
```

```typescript
const tokenExchangeProcessor = (port: TokenExchangePort): StateProcessor<S> => ({
  name: 'TokenExchange',
  requires: [OidcCallback], produces: [OidcTokens],
  async process(ctx) {
    const cb = ctx.get(OidcCallback);
    ctx.put(OidcTokens, await port.exchange(cb.code, cb.redirectUri));
  },
});
```

```rust
struct OidcTokenExchangeProcessor<P: TokenExchangePort> { port: P }
impl<P: TokenExchangePort> StateProcessor<S> for OidcTokenExchangeProcessor<P> { ... }
```

The I/O contract is explicit, but the processor still coordinates I/O. Porting requires adapting both that processor and its port. Use this when the application already manages dependencies through constructor injection or a processor needs several calls.

### Pattern 3: DataProcessor + ServiceBinding (Complex Flows Only)

Keep the transformation in a `DataProcessor`. A service binding implements tramli's `StateProcessor` and connects that transformation to I/O and `FlowContext`, the flow's typed data container.

```java
// Portable transformation
interface DataProcessor<In, Out> { Out transform(In input); }

// Language-specific I/O wiring
class OidcTokenExchangeBinding implements StateProcessor {
    private final OidcService service;
    private final DataProcessor<RawTokens, ValidatedTokens> validator;

    @Override public void process(FlowContext ctx) {
        var raw = service.exchangeCode(ctx.get(OidcCallback.class));  // I/O
        ctx.put(ValidatedTokens.class, validator.transform(raw));      // Transformation
    }
}
```

Transformation logic can be ported and tested independently. The extra interface and binding are useful when that logic is substantial; a small flow usually does not need both layers.

<a id="選び方"></a>

## When not to use these patterns

If a processor has no I/O, there is nothing to separate. Use Pattern 1 for a single I/O operation, Pattern 2 when multiple calls are already managed through dependency injection, and Pattern 3 when a large flow has complex transformations.
Avoid adding a port or service binding solely to follow this guide: each extra layer should make a specific test or future change easier.
