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
| put(key, value) | Store value. Overwrites previous. Fires stateLogger if set. |
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

| Method | Behavior |
|--------|----------|
| registerAlias(key/type, alias) | Map alias string to key/TypeId |
| aliasOf(key/type) | Get alias for key (or null) |
| keyOfAlias(alias) / typeIdOfAlias(alias) | Get key/TypeId for alias (or null) |
| toAliasMap() | Export all aliases as Map<alias, key> |
| fromAliasMap(map) | Import aliases from Map<alias, key> |

## Key Design

- Java: keyed by `Class<?>` (one value per type)
- TypeScript: keyed by `FlowKey<T>` (branded string)
- Rust: keyed by `TypeId` (one value per type, CloneAny trait bound)
