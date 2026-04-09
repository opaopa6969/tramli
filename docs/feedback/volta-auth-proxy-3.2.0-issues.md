# Issues: volta-auth-proxy tramli 3.2.0 移行で気づいた点

> Date: 2026-04-09
> Project: volta-auth-proxy
> tramli: 1.16.0 → 3.2.0 + tramli-plugins 3.2.0

---

## Issue 1: ObservabilityPlugin が Logger API を上書きする

### 症状

`FlowEngine` に手動で `setTransitionLogger` / `setGuardLogger` / `setErrorLogger` を設定した後に `ObservabilityPlugin.install(engine)` を呼ぶと、**手動設定が上書きされる**。逆順で呼べば手動設定が勝つが、意図が不明確。

### 再現

```java
// 手動で詳細ログを設定
engine.setTransitionLogger(t -> log.info("{0} {1}→{2}", t.flowName(), t.from(), t.to()));

// ObservabilityPlugin が全部上書きする
new ObservabilityPlugin(sink).install(engine);

// → 手動ログが消える
```

### 提案

`ObservabilityPlugin.install()` が既存 logger をチェーンするか、`addTransitionLogger` (append) と `setTransitionLogger` (replace) を分けるか。

```java
// 案A: チェーン
engine.addTransitionLogger(t -> ...);  // 既存に追加

// 案B: ObservabilityPlugin がチェーン対応
plugin.install(engine, ChainMode.APPEND); // 既存を維持して追加
```

現状の回避策: ObservabilityPlugin を使わず、手動で TelemetrySink に投げるラッパーを書いた。

---

## Issue 2: TelemetryEvent に flowName がない

### 症状

`LogEntry.Transition` には `flowName()` が追加された（v1.16.0）。しかし `ObservabilityPlugin` が生成する `TelemetryEvent` には `flowName` が含まれない。

```java
// LogEntry.Transition — flowName あり ✓
record Transition(String flowId, String flowName, String from, String to, String trigger) {}

// TelemetryEvent — flowName なし ✗
record TelemetryEvent(String type, Instant timestamp, String flowId, String message) {}
```

### 影響

テレメトリログで「この遷移は OIDC フローか MFA フローか」がわからない。`message` に埋め込まれてはいるが、構造化データとしてフィルタリングできない。

### 提案

```java
// TelemetryEvent に flowName を追加
record TelemetryEvent(String type, Instant timestamp, String flowId, String flowName, String message) {}
```

---

## Issue 3: PluginRegistry の型パラメータが使いにくい

### 症状

`PluginRegistry<S>` は特定の FlowState 型に束縛される。しかし volta-auth-proxy は **4つの異なる FlowState enum** (OidcFlowState, PasskeyFlowState, MfaFlowState, InviteFlowState) を持つ。1つの PluginRegistry で全フローを管理できない。

```java
// これができない
var registry = new PluginRegistry<OidcFlowState>();
registry.analyzeAll(mfaFlowDef);  // コンパイルエラー: MfaFlowState ≠ OidcFlowState
```

### 現状の回避策

`@SuppressWarnings("unchecked")` で raw type にキャストしている。

```java
@SuppressWarnings({"unchecked", "rawtypes"})
var report = ((PluginRegistry) registry).analyzeAll(oidcFlowDef);
```

### 提案

`PluginRegistry` をワイルドカード型にするか、`analyzeAll` を static メソッドにして型パラメータを独立させる。

```java
// 案A: PluginRegistry を型パラメータなしに
public final class PluginRegistry {
    public <S extends Enum<S> & FlowState> PluginReport analyzeAll(FlowDefinition<S> def) { ... }
}

// 案B: static メソッド
PluginReport report = PluginRegistry.analyze(plugins, oidcFlowDef);
```

---

## 良かった点（Issue ではないが記録）

- **パッケージ名変更** (`com.tramli` → `org.unlaxer.tramli`): sed 一発で 53 ファイル置換。API は完全互換。
- **AuditStorePlugin**: `wrapStore()` の decorator パターンが綺麗。SqlFlowStore をそのまま渡すだけで監査機能が追加される。
- **PolicyLintPlugin.defaults()**: デフォルトポリシーが用意されてるのが親切。何もしなくても基本的な設計チェックが走る。
- **PluginRegistry.applyStorePlugins()**: store の decorator チェーンを自動管理。手動で wrap するより安全。
