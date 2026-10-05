# tramli Language Compatibility Matrix

This document is for contributors considering a tramli implementation in another language.
It explains which language features help preserve typed states, guard results, and context access, and records the project's porting assessment.
If you want to choose among the existing Java, TypeScript, and Rust implementations, start with the [language guide](language-guide.md#which-language-should-i-use).

## Criteria

A port can execute the same transitions yet lose useful checks. A misspelled state might become a runtime error, a new guard result might go unhandled, or reading context data might require a cast at every call site. The criteria below describe the language features that help avoid those problems.

| Criterion | What it means in tramli | Example or benefit |
|-----------|------------------------|--------------------|
| **Enum safety** | States come from a declared set of values. | A misspelled state name is caught during compilation. |
| **Sealed types** | The alternatives for a result are a closed set. | `GuardOutput` has Accepted, Rejected, and Expired outcomes. |
| **Type-keyed context** | A data key identifies the type returned by a context lookup. | Java's `ctx.get(OrderRequest.class)` returns an `OrderRequest` without a cast at the call site. TypeScript uses a typed `FlowKey`; Rust uses `TypeId`. |
| **Generics** | Flow and processor APIs carry the state type. | `FlowDefinition<S>` and `StateProcessor<S>` keep the state type in the API. |
| **Exhaustive switch** | The language can check whether all alternatives are handled. | Adding a guard result can reveal callers that need another case. |

These are **language-level checks**. tramli's **flow-level checks** happen separately when `build()` runs: for example, checking that a processor's required data is available on every path. Compiling successfully does not prove that a flow passes those checks. A language with fewer static checks can still implement `build()` validation, but more mistakes remain for runtime checks and tests to detect.

## Matrix

Only Java, TypeScript, and Rust are implemented here. The other rows assess possible ports; they do not indicate available packages or a commitment to support those languages.

The symbols and star ratings retain the project's existing assessment. ✅ indicates a direct fit for the criterion, ⚠️ indicates qualifications or extra work, and ❌ indicates that the assessment does not identify an equivalent built-in check. Stars summarize the fit for this design, not the overall quality of a language. This is a porting baseline, not a complete inventory of features in every current compiler release.

| Language | Enum Safety | Sealed Types | Type-Keyed Context | Generics | Exhaustive Switch | tramli Fit | Notes |
|----------|------------|-------------|-------------------|----------|------------------|-----------|-------|
| **Java** | ✅ enum + switch | ✅ sealed interface | ✅ `Class<?>` | ✅ | ✅ sealed warning | ★★★★★ | Implemented |
| **TypeScript** | ✅ string literal union | ✅ discriminated union | ✅ FlowKey (string) | ✅ | ✅ exhaustive check | ★★★★★ | Implemented; exhaustiveness checks need to be expressed in code |
| **Rust** | ✅ enum + match forced | ✅ enum exhaustive | ✅ TypeId | ✅ | ✅ match forced | ★★★★★ | Implemented |
| **Kotlin** | ✅ enum + when | ✅ sealed class | ✅ `KClass<*>` | ✅ | ✅ sealed + when | ★★★★★ | Can use Java through interop; first candidate for a separate port |
| **Swift** | ✅ enum + switch forced | ✅ enum associated values | ✅ `Any.Type` | ✅ | ✅ switch exhaustive | ★★★★☆ | iOS/macOS candidate; type-keyed context needs an `Any.Type`-based API |
| **C#** | ✅ enum | ⚠️ no sealed unions in this baseline | ✅ `Type` | ✅ | ⚠️ warning only | ★★★★☆ | .NET candidate; reassess union support for the chosen compiler version |
| **Scala** | ✅ enum (Scala 3) | ✅ sealed trait + match | ✅ `ClassTag` | ✅ | ✅ match exhaustive | ★★★★★ | Direct language-feature fit; no implementation here |
| **F#** | ✅ discriminated union | ✅ DU = sealed | ✅ `System.Type` | ✅ | ✅ match exhaustive | ★★★★★ | Discriminated unions (DU) represent the closed result alternatives |
| **Dart** | ✅ enum (3.0+) | ✅ sealed class (3.0+) | ✅ `Type` | ✅ | ✅ switch exhaustive (3.0+) | ★★★★☆ | Flutter candidate; assessment targets Dart 3.0+ |
| **Go** | ❌ iota const | ❌ none | ⚠️ `reflect.Type` verbose | ⚠️ limited | ❌ none | ★★☆☆☆ | Would need additional checks for the closed state and result sets |
| **Python** | ⚠️ Enum (weak) | ❌ none | ⚠️ `type()` dynamic | ⚠️ hints only | ❌ none | ★★☆☆☆ | Flow validation can run at `build()`; static guarantees need separate tooling |
| **PHP** | ✅ enum (8.1+) | ❌ none | ⚠️ `::class` | ❌ none | ⚠️ match (8.0+) | ★★★☆☆ | Assessment uses enums from PHP 8.1+ and match from 8.0+ |
| **Ruby** | ❌ no enum | ❌ none | ❌ all dynamic | ❌ none | ❌ none | ★☆☆☆☆ | Would rely on runtime validation rather than these static checks |
| **Zig** | ✅ enum + switch forced | ✅ tagged union | ⚠️ comptime type | ⚠️ comptime | ✅ switch exhaustive | ★★★☆☆ | Would need a context design suited to compile-time types |
| **C++** | ⚠️ enum class | ❌ variant (verbose) | ⚠️ `typeid` | ✅ templates | ❌ non-exhaustive | ★★☆☆☆ | Would need explicit wrappers and checks around the listed features |
| **Elixir** | ❌ atom (dynamic) | ❌ none | ❌ dynamic | ❌ none | ⚠️ pattern match | ★★☆☆☆ | Would rely more on runtime validation for states and result handling |

Before starting a port, verify the target language version and its exact checking rules. For example, [C#'s union specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/proposals/csharp-15.0/unions) is relevant when revisiting the C# baseline. The table does not replace a prototype or a test of the proposed API.

## If we were to expand

The existing candidate order is below. It expresses where a port could be useful and which language features would help; it is not a release schedule.

| Priority | Language | Why |
|----------|----------|-----|
| 1 | **Kotlin** | Java interop, sealed class + when, Android + server |
| 2 | **Swift** | iOS/macOS, enum + exhaustive switch, Apple ecosystem |
| 3 | **C#** | .NET applications; union support needs checking for the target version |
| 4 | **Dart** | Flutter; 3.0+ provides sealed classes and exhaustive switch |

## The pattern

The highest-rated languages can describe a value as **one of a fixed set of alternatives** and help check that callers handle those alternatives. This is often called an algebraic data type: for tramli, the practical examples are a state enum and the three `GuardOutput` outcomes.

A port should preserve both kinds of protection: typed APIs where the language supports them, and the same eight structural checks when `build()` runs. The [shared test scenarios](../shared-tests/README.md) provide existing flows for checking behavior across implementations.
