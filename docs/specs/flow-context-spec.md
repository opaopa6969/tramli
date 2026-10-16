# FlowContext Specification

This specification defines how `FlowContext` stores and retrieves data passed between processing steps, restores data after failures, and uses aliases to handle stored data across languages.
It is intended for Java, TypeScript, and Rust implementers and for users who want to understand how data is handled.
For use cases, see [Why tramli exists](../../README.md#why-tramli-exists) in the README; for an overview, see [FlowContext](../../README.md#flowcontext).

**How to read**: Follow Core Operations → Snapshot / Restore → Alias Support → Key Design to learn about value operations, restoration, aliases, and language-specific keys.

**Terminology**: A key identifies a value; attributes are key-value pairs; an alias is a string name assigned to a language-specific key.
A shallow copy does not duplicate the internal contents of stored values; Rust's snapshot copies values via `Clone` instead (see Snapshot / Restore).
The branded string in `FlowKey<T>` is a string key associated with the value type `T`; `TypeId` is a Rust type identifier; `CloneAny` is a Rust trait for storing and cloning values of different types.

**Source**: Java reference implementation (v3.1.0)

## Core Operations

| Method | Behavior |
|--------|----------|
| put(key, value) | Store value, overwriting the previous value. During a successful engine processor, an opt-in stateLogger reports each added/replaced key once with its final value and transition source state; failures/produces violations emit nothing. Java/TS use reference identity; Rust records types written by put. See [Loggers](flow-engine-spec.md#loggers). |
| get(key) | Return value or throw MISSING_CONTEXT |
| find(key) | Return value if present. Absent: `Optional.empty()` (Java), `undefined` (TypeScript), `None` (Rust) |
| has(key) | Return true if key present |

## Snapshot / Restore

| Method | Behavior |
|--------|----------|
| snapshot() | Copy of all attributes (for rollback). Depth is language-dependent; see note |
| restoreFrom(snapshot) | Clear all attributes, restore from snapshot |

**Note (language difference)**:
- Java / TypeScript: shallow copy of the attribute map. Values are shared, so in-place mutations of a stored object are NOT rolled back.
- Rust: each value is copied with its `Clone` implementation (`CloneAny::clone_box`), because a boxed value cannot be shared without changing the storage type. In-place mutations are rolled back to the extent that the type's `Clone` copies its contents (e.g. `Vec` contents are copied; values behind `Rc`/`Arc` are shared).
- In all languages, Processors should add new entries via `put()` rather than mutate stored values, so rollback behaves the same regardless of copy depth.

## Alias Support (Cross-Language Serialization)

| Java / TypeScript | Rust | 動作 |
|-------------------|------|------|
| `registerAlias(key/type, alias)` | `register_alias::<T>(alias)` | Register the alias ↔ key mapping in both directions |
| `aliasOf(key/type)` | `alias_of(&type_id)` | Get the registered alias (unregistered: Java `null`, TS `undefined`, Rust `None`) |
| `keyOfAlias(alias)` | `type_id_of_alias(alias)` | Get the registered key (unregistered: same as above) |
| `exportAliases()` | `export_aliases()` | Return an independent copy of the registry (alias → key) |
| `importAliases(map)` | `import_aliases(map)` | Add or overwrite registry entries, updating both directions like `registerAlias` |
| `toAliasedData()` | `to_aliased_data()` | Return data (alias → value). Java/TS: shallow copy; Rust: borrowed values |
| `fromAliasedData(map)` | `from_aliased_data(map)` | Add or overwrite data for registered aliases; unregistered aliases are ignored |
| `toAliasMap()` (**deprecated**) | none | Legacy behavior kept: Java returns alias → **value**, TS returns alias → **key** |
| `fromAliasMap(map)` (**deprecated**) | none | Legacy behavior kept: Java imports **data**, TS imports the **registry** |

Unregistered keys are exported as `Class.getSimpleName()` (Java), the key string (TS), or `std::any::type_name` of the concrete type (full name, Rust). Rust obtains it through the default `CloneAny::type_name()` implementation, which also works for restored values. Fallback names are not registered automatically; a value whose alias is not registered before import is ignored.

The registry type is `Map<String, Class<?>>` (Java), `Map<string, string>` (TS), and `HashMap<String, TypeId>` (Rust). Keys are language- and process-specific, so the registry itself is not a shared storage format. Use the same aliases and data schema across languages, and map aliases to keys in each language.

The data type is `Map<String, Object>` (Java) and `Map<string, unknown>` (TS); neither validates value types, so the caller deserializes to the right type. Rust exports `HashMap<String, &dyn CloneAny>` and imports an owned `HashMap<String, Box<dyn CloneAny>>`, storing only values whose `as_any().type_id()` matches the registered `TypeId` and keeping existing data otherwise. These APIs do not perform JSON conversion.

Migration: Java's legacy API maps to `toAliasedData` / `fromAliasedData`; TypeScript's maps to `exportAliases` / `importAliases`. To save values in TypeScript, use the data API. Removal of the legacy API will be considered for the next major version.

## Key Design

- Java: keyed by `Class<?>` (one value per type)
- TypeScript: keyed by `FlowKey<T>` (branded string)
- Rust: keyed by `TypeId` (one value per type, CloneAny trait bound)
