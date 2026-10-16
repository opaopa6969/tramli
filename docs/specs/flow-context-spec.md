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
| `registerAlias(key/type, alias)` | `register_alias::<T>(alias)` | alias とキーの両方向を登録する |
| `aliasOf(key/type)` | `alias_of(&type_id)` | 登録済み alias を取得する（未登録: Java `null`、TS `undefined`、Rust `None`） |
| `keyOfAlias(alias)` | `type_id_of_alias(alias)` | 登録済みキーを取得する（未登録時は上記と同様） |
| `exportAliases()` | `export_aliases()` | 登録表（alias → key）の独立したコピーを返す |
| `importAliases(map)` | `import_aliases(map)` | 登録表を追加・上書きし、`registerAlias` と同じ両方向の更新を行う |
| `toAliasedData()` | `to_aliased_data()` | データ（alias → 値）を返す。Java/TS は浅いコピー、Rust は値への借用 |
| `fromAliasedData(map)` | `from_aliased_data(map)` | 登録済み alias のデータを追加・上書きする。未登録 alias は無視する |
| `toAliasMap()` (**deprecated**) | なし | 旧挙動を維持: Java は alias → **値**、TS は alias → **key** |
| `fromAliasMap(map)` (**deprecated**) | なし | 旧挙動を維持: Java は**データ**を取り込み、TS は**登録表**を取り込む |

未登録キーの書き出し名は Java の `Class.getSimpleName()`、TS の key 文字列、Rust の具象型に対する `std::any::type_name`（完全名）。Rust は `CloneAny::type_name()` の既定実装で取得し、復元された値にも適用する。フォールバック名は自動登録されない。取り込み前に alias を登録しなければ、その値は無視される。

Java は `Map<String, Class<?>>`、TS は `Map<string, string>`、Rust は `HashMap<String, TypeId>` が登録表の型。キーは言語・プロセス固有なので、登録表そのものを共通の保存形式にはしない。言語間で同じ alias とデータのスキーマを使い、各言語で alias とキーを対応付ける。

データの型は Java `Map<String, Object>`、TS `Map<string, unknown>`。両者は値の型を検証せず、呼び出し側で適切な型にデシリアライズする。Rust は書き出しが `HashMap<String, &dyn CloneAny>`、取り込みが所有権を受け取る `HashMap<String, Box<dyn CloneAny>>`。登録された `TypeId` と `as_any().type_id()` が一致する値だけを取り込み、不一致なら既存データを維持する。これらの API 自体は JSON 変換を行わない。

移行先: Java の旧 API は `toAliasedData` / `fromAliasedData`、TS の旧 API は `exportAliases` / `importAliases`。TS で値を保存したい場合はデータ用 API を選ぶ。旧 API の削除は次のメジャーバージョンで検討する。

## Key Design

- Java: keyed by `Class<?>` (one value per type)
- TypeScript: keyed by `FlowKey<T>` (branded string)
- Rust: keyed by `TypeId` (one value per type, CloneAny trait bound)
