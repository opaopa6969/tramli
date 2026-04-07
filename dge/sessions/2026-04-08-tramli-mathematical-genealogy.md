# DGE Session: tramli の数学的系譜 — 偉人に聞く

- **Date**: 2026-04-08
- **Flow**: 🏥 症例検討
- **Characters**: 🔬 David Harel, 📊 Frances Allen, 🔧 Rob Strom, 🧮 Robin Milner, ☕ ヤン

## tramli の位置づけ

tramli = 4 つの既知の理論構造の「build 時検証」における交差点。

| 理論 | 年代 | tramli との関係 |
|------|------|----------------|
| Data-flow analysis (reaching definitions) | 1960s | checkRequiresProduces は reaching definitions の型レベル特殊化 |
| Statecharts | 1987 | SubFlow = composite state の実用的部分集合。Safety 検証のみ |
| Typestate | 1986 | FlowContext = typestate のフロー版。build 時検証（動的ロードのため） |
| π-calculus | 1999 | External = チャネル入力。並行性排除は検証のためのトレードオフ |

## 核心の洞察

requires/produces は、4 つの理論に共通する不変量。
各理論はこの不変量の異なる射影を研究していた。
tramli はその不変量を直接実装した。

## 見落とし

- Liveness: External で永遠にブロックするフローは build() で検出できない
- 並行性: 排除は意図的だが、parallelismHints は独立並行合成の検出に繋がる可能性

## 年表

1960s Allen/Cocke → 1986 Typestate → 1987 Statecharts → 1999 π-calculus → 2026 tramli
