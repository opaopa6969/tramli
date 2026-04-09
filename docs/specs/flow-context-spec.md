# FlowContext Specification

**Source**: Java reference implementation (v3.1.0)

## Core Operations

| Method | Behavior |
|--------|----------|
| put(key, value) | Store value. Overwrites previous. Fires stateLogger if set. |
| get(key) | Return value or throw MISSING_CONTEXT |
| find(key) | Return value or null/None/Option |
| has(key) | Return true if key present |

## Snapshot / Restore

| Method | Behavior |
|--------|----------|
| snapshot() | Shallow copy of all attributes (for rollback) |
| restoreFrom(snapshot) | Clear all attributes, restore from snapshot |

**Note**: Shallow copy — nested object mutations are NOT rolled back.

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
