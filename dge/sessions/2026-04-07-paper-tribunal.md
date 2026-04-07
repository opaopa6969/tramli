# DGE 査読劇: tramli 論文 (Round 1 + Round 2)

- **日時**: 2026-04-07
- **テーマ**: tramli: Definition-Time Validated Constrained Flow Engine with Data-Flow Contracts
- **評価者**: 🔬 ハレル教授, 👤 今泉, 😈 Red Team, 🎩 千石
- **反論者**: 🤝 後輩 + 著者
- **判定**: Major Revision（4人全員一致）→ v2 修正完了

## Gap 一覧

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| G1 | 「build-time」→「definition-time」に用語変更 | 🔴 Critical | ✅ v2 反映 |
| G2 | 定量的評価セクションの欠如 | 🔴 Critical | ✅ v2 反映（§5 追加） |
| G3 | Statecharts/EFSM との理論的位置づけ | 🟠 High | ✅ v2 反映（§2.1 追記） |
| G4 | 形式検証 vs well-formedness check の明示 | 🟠 High | ✅ v2 反映（§3.4, §3.5, §6.1） |
| G5 | 競合比較のフレーミング — trade-off として記述 | 🟠 High | ✅ v2 反映（§5.3 書き直し） |
| G6 | Rust typestate との正直な比較 | 🟠 High | ✅ v2 反映（§2.1, §5.3, §6.1） |
| G7 | 計算量分析の追記 | 🟡 Medium | ✅ v2 反映（§3.5 O(V+E)） |
| G8 | Feature Matrix を主要3競合に絞る | 🟡 Medium | ✅ v2 反映 |
| G9 | Temporal を positioning map から分離 | 🟡 Medium | ✅ v2 反映（§2.3 別セクション化） |
| G10 | build() パフォーマンスベンチマーク | 🟡 Medium | ✅ v2 反映（§4.2） |
| G11 | Threats to Validity サブセクション | 🟡 Medium | ✅ v2 反映（§5.4） |
| G12 | Mermaid 図の挿入 | 🟢 Low | ✅ v2 反映（Fig.1, Fig.2） |
| G13 | XState v5 typegen との詳細比較 | 🟡 Medium | 🔲 未着手（追加調査必要） |
| G14 | Sub-flow context 共有の明記 | 🟢 Low | ✅ v2 反映（§3.7） |

## v2 での主な変更

1. **タイトル変更**: "Build-Time" → "Definition-Time"
2. **§1.3 追加**: Scope and Non-Goals — Statecharts でも形式検証でもないことを明示
3. **§2.1 書き直し**: Harel Statecharts, EFSM, Typestate との理論的位置づけ
4. **§2.3 分離**: Workflow Engines を別セクションに（Temporal との不適切な同軸比較を解消）
5. **§3.4 追記**: requires/produces の限界（宣言を検証、実装は検証しない）
6. **§3.5 追記**: 各チェックの計算量 O(|V|+|E|)、soundness の議論
7. **§5 新設**: Evaluation セクション（実績、検出エラー事例、競合比較、Threats to Validity）
8. **§5.3 書き直し**: 競合比較を trade-off フレーミングに。3競合に絞り込み
9. **§6.1 新設**: Definition-Time vs Compile-Time vs Runtime の3レベル比較
10. **Fig.1, Fig.2 追加**: OIDC flow diagram, Data-flow graph

---

## Round 2 (v2 → v3)

- **評価者**: ☕ ヤン, 🧩 マンガー, 🔬 ハレル教授（留任）
- **判定**: Minor Revision（ヤン）/ Minor Revision（マンガー）/ Accept with Minor Revision（ハレル）

### Round 2 Gap 一覧

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| G15 | 対象読者の明記 | 🟡 Medium | ✅ v3 反映 |
| G16 | 8 項目の選定基準と動機 | 🟡 Medium | ✅ v3 反映（§3.5） |
| G17 | コンパイラ理論との analogies テーブル | 🟡 Medium | ✅ v3 反映（§3 冒頭） |
| G18 | Soundness 性質の可視化 | 🟡 Medium | ✅ v3 反映（§3.4 Property box） |
| G19 | Future Work 優先度 | 🟢 Low | ✅ v3 反映（§7） |
| G20 | 「コミットメントデバイス」の一文 | 🟢 Low | ✅ v3 反映（§6.4） |
| G21 | 3言語 = 仕様/実装分離のフレーミング | 🟢 Low | ✅ v3 反映（§4.1） |

### v3 での主な変更

1. **対象読者を明記**: タイトル下に target audience 追記
2. **§3 冒頭にコンパイラ analogies テーブル追加**: requires/produces = 型チェック、DataFlowGraph = reaching definitions 等
3. **§3.4 に Soundness Property box 追加**: sound but not complete を明示
4. **§3.5 に選定基準追記**: 「≥2 プロジェクトで観測されたバグパターン」
5. **§4.1 に仕様/実装分離のフレーミング追加**: JDBC analogy
6. **§6.4 新設**: Constraints as Commitment Device（Rust borrow checker, SQL FK, Git DAG との analogies）
7. **§7 Future Work に優先度追記**: High/Medium/Low

### 未着手 Gap

| # | Gap | Status |
|---|-----|--------|
| G13 | XState v5 typegen との詳細比較 | ✅ v3 反映（§5.4 Deep Dive 追加） |
