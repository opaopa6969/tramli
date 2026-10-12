# FlowContext Specification

この仕様は、処理の間でデータを受け渡す `FlowContext` の保存・取得、失敗時の復元、言語間で保存データを扱うための別名を決めます。
Java・TypeScript・Rust の実装者と、データの扱いを確認する利用者向けです。
利用目的は README の[「なぜ tramli が必要か」](../../README-ja.md#なぜ-tramli-が必要か)、全体像は[「FlowContext」](../../README-ja.md#flowcontext)を参照してください。

**読み方**: Core Operations → Snapshot / Restore → Alias Support → Key Design の順に、値の操作、復元、別名、言語ごとのキーを確認します。

**用語**: キーは値を識別するもの、属性（attributes）はキーと値の組、エイリアス（alias）は言語固有のキーに付ける文字列の別名です。
浅いコピー（shallow copy）は格納した値の内部まで複製しないコピーです。
`FlowKey<T>` の branded string は値の型 `T` と結び付けた文字列キー、`TypeId` は Rust の型識別子、`CloneAny` は異なる型の値を格納し複製するための Rust の trait です。

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
