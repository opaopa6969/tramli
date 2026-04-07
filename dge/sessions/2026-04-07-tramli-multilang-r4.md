# DGE Session: tramli マルチ言語展開 — Round 4

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review (round 4)
- **Pattern**: protocol-design + security-adversary
- **Characters**: ☕ ヤン, 👤 今泉, 😈 Red Team, 🕵 右京, ⚔ リヴァイ
- **Focus**: HTTP API 先送り判断 + tramli-ts リポ構成 + v0.1.0 最終スコープ

## 設計判断

### HTTP API は v0.2.0 先送り
- v0.1.0 はネイティブライブラリ（Java + TS）に集中
- HTTP API は外部キック/管理コンソール需要時に Javalin ベースで tramli-http モジュール提供
- 認証はアプリ側責務、tramli-http はミドルウェアフック提供

### tramli-ts リポ構成
- vitest + tsc, ゼロ runtime 依存
- @unlaxer/tramli on npm
- shared-tests は Java リポをソースオブトゥルースとしてコピー管理

### v0.1.0 最終スコープ
- Java: deploy 済み
- TypeScript: ~800 lines, ~10 files, async FlowEngine
- shared-tests: 14 YAML cases

### v0.2.0 予定
- Java: FlowListener, バージョニング, YAML テストハーネス, tramli-http
- TS: 永続化 FlowStore, takt 統合サンプル
