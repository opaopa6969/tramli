# DGE Session: Logger API 設計

- **Date**: 2026-04-08
- **Flow**: 🔍 design-review
- **Characters**: ☕ ヤン, 👤 今泉, ⚔ リヴァイ, 🎩 千石

## 結論

- set（上書き）方式。add（スタック）は不要 — 合成はユーザーのラムダ内で
- removeAllLoggers() 1 つだけ。個別 remove は不要（set(null) で代用可）
- ErrorLogger を簡素化: (from, to, trigger, throwable)。context の key/value は StateLogger の仕事
- StateLogger はオプト・イン（context.put の hook）

## Round 2: Class<?> vs String

### 結論
- Class<?> と String の両取り: entry record に Class<?> type + String typeName() を提供
- 全 Logger を entry record 方式に変更（将来フィールド追加時に後方互換）
- Rust は TypeId + type_name(&str)、TS は FlowKey(String)

## 最終 API

```java
// Entry records
public record TransitionLogEntry(String from, String to, String trigger) {}
public record StateLogEntry(String state, Class<?> type, Object value) {
    public String typeName() { return type.getSimpleName(); }
}
public record ErrorLogEntry(String from, String to, String trigger, Throwable cause) {}

// Setters
engine.setTransitionLogger(entry -> log.info("{} → {}", entry.from(), entry.to()));
engine.setStateLogger(entry -> log.debug("put {} = {}", entry.typeName(), entry.value()));
engine.setErrorLogger(entry -> log.error("error: {}", entry.cause().getMessage()));
engine.removeAllLoggers();
```
