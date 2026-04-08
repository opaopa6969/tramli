# tramli Language Compatibility Matrix

Which languages can faithfully implement tramli's design philosophy?

## Criteria

tramli's core value comes from:
1. **Enum safety** — typos are compile errors, not runtime surprises
2. **Sealed types** — GuardOutput (Accepted/Rejected/Expired) must be exhaustively handled
3. **Type-keyed context** — `ctx.get(OrderRequest.class)` with no casts, no string keys
4. **Generics** — FlowDefinition<S>, StateProcessor<S>
5. **Exhaustive switch** — compiler warns if you miss a case

Languages that lack these features can still run tramli's logic, but lose the "if it compiles, it's structurally sound" guarantee that makes tramli worth using.

## Matrix

| Language | Enum Safety | Sealed Types | Type-Keyed Context | Generics | Exhaustive Switch | tramli Fit | Notes |
|----------|------------|-------------|-------------------|----------|------------------|-----------|-------|
| **Java** | ✅ enum + switch | ✅ sealed interface | ✅ `Class<?>` | ✅ | ✅ sealed warning | ★★★★★ | Implemented |
| **TypeScript** | ✅ string literal union | ✅ discriminated union | ✅ FlowKey (string) | ✅ | ✅ exhaustive check | ★★★★★ | Implemented |
| **Rust** | ✅ enum + match forced | ✅ enum exhaustive | ✅ TypeId | ✅ | ✅ match forced | ★★★★★ | Implemented |
| **Kotlin** | ✅ enum + when | ✅ sealed class | ✅ `KClass<*>` | ✅ | ✅ sealed + when | ★★★★★ | Java interop. Best next candidate |
| **Swift** | ✅ enum + switch forced | ✅ enum associated values | ✅ `Any.Type` | ✅ | ✅ switch exhaustive | ★★★★☆ | iOS/macOS. `Any.Type` slightly verbose |
| **C#** | ✅ enum | ⚠️ no sealed unions (yet) | ✅ `Type` | ✅ | ⚠️ warning only | ★★★★☆ | .NET. Sealed unions coming |
| **Scala** | ✅ enum (Scala 3) | ✅ sealed trait + match | ✅ `ClassTag` | ✅ | ✅ match exhaustive | ★★★★★ | Theoretically perfect. Small userbase |
| **F#** | ✅ discriminated union | ✅ DU = sealed | ✅ `System.Type` | ✅ | ✅ match exhaustive | ★★★★★ | Functional. DU is perfect for tramli |
| **Dart** | ✅ enum (3.0+) | ✅ sealed class (3.0+) | ✅ `Type` | ✅ | ✅ switch exhaustive (3.0+) | ★★★★☆ | Flutter. Dart 3.0 was a game changer |
| **Go** | ❌ iota const | ❌ none | ⚠️ `reflect.Type` verbose | ⚠️ limited | ❌ none | ★★☆☆☆ | Philosophy mismatch |
| **Python** | ⚠️ Enum (weak) | ❌ none | ⚠️ `type()` dynamic | ⚠️ hints only | ❌ none | ★★☆☆☆ | Dynamic. build() works but no type safety |
| **PHP** | ✅ enum (8.1+) | ❌ none | ⚠️ `::class` | ❌ none | ⚠️ match (8.0+) | ★★★☆☆ | 8.1+ enum is decent |
| **Ruby** | ❌ no enum | ❌ none | ❌ all dynamic | ❌ none | ❌ none | ★☆☆☆☆ | tramli benefits ≈ zero |
| **Zig** | ✅ enum + switch forced | ✅ tagged union | ⚠️ comptime type | ⚠️ comptime | ✅ switch exhaustive | ★★★☆☆ | Low-level. Dynamic map feels unnatural |
| **C++** | ⚠️ enum class | ❌ variant (verbose) | ⚠️ `typeid` | ✅ templates | ❌ non-exhaustive | ★★☆☆☆ | Template hell |
| **Elixir** | ❌ atom (dynamic) | ❌ none | ❌ dynamic | ❌ none | ⚠️ pattern match | ★★☆☆☆ | OTP GenStateMachine is the competitor |

## If we were to expand

| Priority | Language | Why |
|----------|----------|-----|
| 1 | **Kotlin** | Java interop, sealed class + when, Android + server |
| 2 | **Swift** | iOS/macOS, enum + switch exhaustive, Apple ecosystem |
| 3 | **C#** | .NET, enterprise, sealed unions coming |
| 4 | **Dart** | Flutter, 3.0+ has sealed + exhaustive switch |

## The pattern

Languages with ★★★★★ share a common trait: **algebraic data types** (or their equivalent). Enum = sum type. Sealed = closed set of variants. Exhaustive match = the compiler enforces totality.

tramli's design is essentially: "apply algebraic data type thinking to workflow definitions." Languages that don't have ADTs can implement the mechanics, but can't provide the safety guarantees that make tramli valuable.

This is why the author doesn't want to use languages that score ★★☆☆☆ or below — the "structurally sound by construction" feeling disappears.
