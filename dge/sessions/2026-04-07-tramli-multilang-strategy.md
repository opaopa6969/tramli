# DGE Session: tramli マルチ言語展開戦略

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review
- **Structure**: 🗣 座談会
- **Template**: feature-planning
- **Pattern**: new-project + delegation-matrix
- **Characters**: ☕ ヤン, 👤 今泉, 🦅 鷲津, 🎭 ソクラテス, ⚔ リヴァイ

## Gap 一覧

### Scene 1: ネイティブ vs HTTP API
1. **ネイティブ移植 vs HTTP API の責務分離** — ネイティブがフロー定義・実行の本体。HTTP API は状態公開・監視用。プロセッサのリモート実行は設計思想に反する。
2. **移植対象言語の優先度** — TypeScript のみ即時需要あり（takt, AskOS）。Rust/Python/C# は需要発生時。

### Scene 2: TypeScript 移植の技術課題
3. **TypeScript での FlowState モデリング** — string literal union + Record。enum は使わない。
4. **FlowContext のキー方式** — クラスコンストラクタをキーにする方式。Java 版の「型＝キー」哲学を維持。

### Scene 3: DSL と型
5. **Builder DSL の TypeScript 移植方針** — Java 版とほぼ同一の API 表面。build() で 9 バリデーション。

### Scene 4: プロジェクト構造
6. **共有テストスイートの設計** — YAML ベースのテストケース定義で状態遷移シーケンスを言語横断検証。
7. **HTTP API のスコープ** — Java FlowEngine のリモートファサード。状態取得、遷移履歴、resume。
8. **パッケージ名とバージョニング** — npm は tramli or @unlaxer/tramli。バージョンは言語間独立。
