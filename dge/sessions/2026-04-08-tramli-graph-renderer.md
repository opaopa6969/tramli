# DGE Session: GraphRenderer — ラムダ注入によるレンダリング汎用化

- **Date**: 2026-04-08
- **Flow**: 🔍 design-review
- **Characters**: ☕ ヤン, 👤 今泉, 🎩 千石, ⚔ リヴァイ

## 結論

- RenderableDataFlow + RenderableStateDiagram の read-only ビュー record
- renderDataFlow(Function) で汎用レンダリング。toMermaid() は残す（ショートカット）
- MermaidGenerator に static レンダラーメソッド追加（メソッドリファレンスで使える）
- Pipeline にも同じ renderDataFlow()
- 3 言語同一パターン

## API

```java
// 汎用
graph.renderDataFlow(MermaidGenerator::dataFlow);
graph.renderDataFlow(myDotRenderer);

// ショートカット（後方互換）
graph.toMermaid();  // = renderDataFlow(MermaidGenerator::dataFlow)
```
