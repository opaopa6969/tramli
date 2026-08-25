---
name: generate-diagram
description: tramli の FlowDefinition から Mermaid 図（状態遷移図・データフロー図・外部契約図）を生成する手順。3言語対応
volta:
  version: 1
  namespace: tramli
  locality: repo
  tags: [tramli, mermaid, diagram, visualization]
  applies_when:
    - repo.has_file: lang/
  requires:
    tools: []
    resources: []
  min_role: viewer
  export: allowed
---
# tramli の Mermaid 図生成

tramli は FlowDefinition から3種類の Mermaid 図を生成する。すべて GitHub Markdown に貼れる `stateDiagram-v2` または `flowchart LR` 形式。

## 1. 状態遷移図（MermaidGenerator.generate）

いつ使う: README やドキュメントにフロー全体を載せるとき。

```java
String mermaid = MermaidGenerator.generate(oidcFlow);
// stateDiagram-v2 形式
```

```typescript
const mermaid: string = MermaidGenerator.generate(oidcFlow);
```

```rust
let mermaid: String = MermaidGenerator::generate(&oidc_def);

// v1.8.0+: 明示的にビューを選択
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::State);
```

## 2. データフロー図（generateDataFlow）

いつ使う: processor 間の requires/produces 関係を可視化するとき。

```java
String mermaid = MermaidGenerator.generateDataFlow(oidcFlow);
// flowchart LR — どのデータがどの processor 間を流れるかを表示
```

```typescript
const mermaid: string = MermaidGenerator.generateDataFlow(oidcFlow);
```

```rust
let mermaid: String = MermaidGenerator::generate_data_flow(&oidc_def);
// または MermaidView::DataFlow
```

## 3. 外部契約図（generateExternalContract）

いつ使う: 外部クライアントが送受信すべきデータを文書化するとき。

```java
String mermaid = MermaidGenerator.generateExternalContract(oidcFlow);
// guard の requires（クライアントが送信）と produces（クライアントが受信）を表示
```

```typescript
const mermaid: string = MermaidGenerator.generateExternalContract(oidcFlow);
```

```rust
// Rust では MermaidView::ExternalContract を使用
let mermaid = MermaidGenerator::generate_with_view(&oidc_def, MermaidView::ExternalContract);
```

## DataFlowGraph から直接 Mermaid を取得

`build()` 後に DataFlowGraph インスタンスから直接 Mermaid を取得することも可能:

```java
String mermaid = graph.toMermaid();     // flowchart LR 形式
String json = graph.toJson();           // JSON 形式
```

```typescript
const mermaid: string = graph.toMermaid();
```

```rust
let mermaid: String = graph.to_mermaid();  // stateDiagram-v2 形式
let json = graph.to_json();                // JSON 形式
```

## 判断基準

- フロー全体を示すなら `generate()`（状態遷移図）
- データ依存関係に焦点を当てるなら `generateDataFlow()`
- API 仕様として外部クライアント向けなら `generateExternalContract()`
- Java のみ `renderStateDiagram()` があるが、TS/Rust は `toMermaid()` を使う
- Mermaid 図は GitHub Markdown にそのまま貼れる。PR の説明に使うと効果的
