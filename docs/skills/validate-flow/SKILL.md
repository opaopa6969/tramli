---
name: validate-flow
description: tramli の FlowDefinition を build() で8項目検証する手順。何をチェックするか、どんなエラーが出るか、3言語（Java/TS/Rust）の違いを含む
volta:
  version: 1
  namespace: tramli
  locality: repo
  tags: [tramli, flow-definition, validation, build]
  applies_when:
    - repo.has_file: lang/
  requires:
    tools: []
    resources: []
  min_role: viewer
  export: allowed
---
# tramli FlowDefinition の8項目検証

tramli は `build()` 呼び出し時に FlowDefinition の構造的健全性を検証する。これは実行時エラーではなく**定義時エラー** — コンパイル時に近いタイミングで不正なフローを排除する。

## build() が実行する11のチェック

| # | チェック | エラーメッセージ | 修正方法 |
|---|---------|-----------------|---------|
| 1 | 初期状態の存在 | "No initial state found" | `isInitial = true` の enum 値を定義 |
| 2 | 到達可能性 | "State X is not reachable from Y" | 遷移パスを追加 |
| 3 | 終端へのパス | "No path from X to any terminal state" | `isTerminal = true` の状態への遷移を追加、または `allowPerpetual()` |
| 4 | DAG（auto/branch） | "Auto/Branch transitions contain a cycle" | auto遷移のループを解消 |
| 5 | Branch 完全性 | "Branch target 'label' -> X is not a valid state" | `.to()` の状態を enum に追加 |
| 6 | requires/produces | "Guard/Processor 'X' requires Y but not available" | 上流で Y を produces するか、requires から外す |
| 7 | auto/external 衝突 | "State X has both auto/branch and external transitions" | auto か external かに統一 |
| 8 | 終端の出口なし | "Terminal state X has outgoing transition to Y" | 終端状態からの遷移を削除 |
| 9 | SubFlow exit 完全性 | "SubFlow 'X' has terminal Y with no onExit mapping" | `.onExit()` で全 terminal を対応付け |
| 10 | SubFlow ネスト深さ | "SubFlow nesting depth exceeds maximum of 3" | ネストを3段以内に整理 |
| 11 | SubFlow 循環参照 | "Circular sub-flow reference detected" | SubFlow の参照グラフからループを削除 |

## 3言語の build() 呼び出し

```java
var def = builder.build();
// FlowException が投げられる。メッセージにアクション可能な内容が含まれる
```

```typescript
const def = builder.build();
// FlowError が投げられる。メッセージにアクション可能な内容が含まれる
```

```rust
let def = builder.build()?;
// Err(FlowError) を返す。build_and_validate() で詳細な構造診断を取得
let result = builder.build_and_validate();
for err in &result.errors {
    eprintln!("tramli: {} — {}", err.code, err.message);
}
```

## build() 後の warnings（エラーではないが注意）

| 警告 | 条件 | 対応 |
|-----|------|-----|
| Liveness risk | `allowPerpetual()` + external transitions | perpetual フローで external を使う理由を確認 |
| Dead data | produces されたが下流で requires されない型 | 不要な produces を削除するか、下流で消費する |
| Exception route ordering | onStepError で親クラスが子より前 | 例外クラスの順序を子→親に並べ替え |

## requires/produces エラーの分析

processor が失敗した場合、エラー遷移先の状態の requires は以下に対してチェックされる:
- processor 実行**前**に利用可能な型（guard の produces を含む）
- processor の produces は**含まれない**（processor が失敗したため）

この仕組みにより、エラー遷移先でもデータ不整合が起きないことを定義時に保証する。

## 判断基準

- `build()` が失敗したら、エラーメッセージの番号を上記表と照合し、根本原因を特定する
- warnings は無視せず、liveness risk と dead data は潜在的な設計欠陥のシグナル
- Rust では `build_and_validate()` を使うと全エラーを一括取得できる（最初のエラーで停止しない）
