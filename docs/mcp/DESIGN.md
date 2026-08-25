# tramli MCP 化設計 — Phase 2

> Phase 1 survey: `docs/mcp/survey.json` / `docs/mcp/SURVEY.md`（2026-08-21）
> 割当表: `volta-mcp/docs/MCPIFY-phase2-plan.md` 行 #8 — `tramli | skill-only | library | ns=tramli | port=—`

## 1. namespace と種別

- **namespace**: `tramli`
- **種別**: `skill-only`（常駐 MCP バックエンドを立てない）
- **理由**: tramli は import して使う純粋関数ライブラリ。起動1秒以内の `build()` 検証・Mermaid 生成・DataFlowGraph 分析・SkeletonGenerator が中心であり、状態を持たない。常駐プロセスの意義が薄い。代わりにエージェントが tramli コードを正しく書くための設計知識を **skill**（手続き知識）として配り、充実した既存ドキュメントを **resource** として機械可読に提供する。

## 2. tools 表

**tool なし**（skill-only のため）。MCP バックエンドを立てないため、`tramli__*` tool は存在しない。

## 3. resources 表

tramli は MCP バックエンドを持たないため、resource は **skill 経由**（volta-mcp ファサードの `skill__resolve` / `volta://skills/tramli/<name>`）で配信する。既存ドキュメントを SKILL.md 本文に組み込み、外部 resource URI は参照として記載。

| resource URI | 内容 | mime | 配信元 |
|---|---|---|---|
| `volta://skills/tramli/validate-flow` | FlowDefinition 8項目検証の手順知識 | text/markdown | SKILL.md |
| `volta://skills/tramli/generate-diagram` | Mermaid 図生成手順 | text/markdown | SKILL.md |
| `volta://skills/tramli/analyze-dataflow` | DataFlowGraph API でデータ依存分析 | text/markdown | SKILL.md |
| `volta://skills/tramli/generate-skeleton` | 3言語 Processor スケルトン生成 | text/markdown | SKILL.md |
| `volta://skills/tramli/choose-flow-pattern` | FlowDefinition vs Pipeline 選択基準 | text/markdown | SKILL.md |

**注意**: `<ns>://spec` / `<ns>://guide` は MCP バックエンドが存在しないため直接提供できない。代わりに `volta://skills/tramli/<name>` で skill 本文として配信し、spec 相当の機械可読情報は各 SKILL.md の frontmatter に `volta.requires` / `volta.applies_when` として埋め込む。

## 4. prompts / skills

### 4.1 skills（5つ）

すべて `locality: repo`（tramli リポジトリでコードを書くときだけ意味を持つ手順）。

| name | 用途 | applies_when | requires |
|---|---|---|---|
| `validate-flow` | FlowDefinition の8項目検証手順。`build()` が何をチェックするか、どんなエラーが出るか | `repo.has_file: lang/` | なし |
| `generate-diagram` | Mermaid 図（状態遷移 + データフロー）生成手順 | `repo.has_file: lang/` | なし |
| `analyze-dataflow` | DataFlowGraph API でデータ依存分析。availableAt/producersOf/consumersOf/deadData/lifetime/pruningHints/impactOf | `repo.has_file: lang/` | なし |
| `generate-skeleton` | 3言語（Java/TS/Rust）の Processor スケルトン生成手順 | `repo.has_file: lang/` | なし |
| `choose-flow-pattern` | FlowDefinition vs Pipeline 選択基準、3種遷移（Auto/External/Branch）の使い分け | `repo.has_file: lang/` | なし |

### 4.2 prompts

prompt なし（skill が手順知識をカバー）。

## 5. 組み合わせ例

### フロー 1: 新規フロー定義の作成
```
skill__resolve(goal="tramli でフローを設計したい", context) → tramli__choose-flow-pattern
  → エージェントが FlowDefinition or Pipeline を選択
  → tramli__generate-skeleton で Java/TS/Rust のスケルトン生成
  → エージェントが processor を実装
  → tramli__validate-flow で build() 検証結果を確認
```

### フロー 2: 既存フローのデータフロー分析
```
skill__resolve(goal="tramli のデータフローを分析したい", context) → tramli__analyze-dataflow
  → DataFlowGraph API で deadData/lifetime/pruningHints を確認
  → tramli__generate-diagram で Mermaid 図を生成して可視化
```

### フロー 3: volta-gateway のフロー設計（他サービスとの連携）
```
tramli__choose-flow-pattern → Rust FlowDefinition 設計
  → tramli__generate-skeleton で Rust スケルトン
  → tramli__validate-flow で検証
  → volta__svc_deploy でデプロイ（別 namespace の tool）
```

## 6. 依存と協調

### provides_to（tramli が提供する側）

| 相手 repo | 能力 | 現存 | 協調内容 |
|---|---|---|---|
| volta-gateway | tramli-rust (crates.io) — request lifecycle を駆動 | yes | tramli の Rust 実装を crates.io 経由で提供済み。skill で設計知識を補完 |
| tramli-appspec | tramli Java — spec-driven flow design の基盤 | yes | tramli 上に構築。skill でフロー設計パターンを共有 |
| tramli-rust | tramli Rust 実装 — 別リポジトリとして crates.io 公開 | yes | lang/rust/ 配下の実装。skill で Rust 特有のパターンを配信 |

### depends_on（tramli が依存する側）

| 相手 repo | 能力 | 現存 | 協調内容 |
|---|---|---|---|
| carta | 階層状態機械 with data-flow verification — 設計思想が対照的 | yes | DGE セッションで対比済み。skill `choose-flow-pattern` で tramli の flat enum 選択理由を記載 |

### issue-hub で登録する協調

- **volta-gateway**: tramli skill が提供するフロー設計知識を volta-gateway の実装に活用できる旨を通知
- **tramli-appspec**: tramli skill の設計知識が tramli-appspec の spec-driven flow design と共有可能
- **tramli-rust**: Rust 特有の skill 内容（typestate pattern, `requires![]` macro）の整合性を確認
- **carta**: 設計思想の対比（flat enum vs hierarchical）を skill 内で言及する旨を通知

## 7. 非対応にした候補と理由

| 候補 | 理由 |
|---|---|
| `library-serve`（MCP サーバ化） | tool 化（JSON定義→検証結果）には TS/Rust ランタイムを呼ぶデシリアライズ層が新規に必要で ROI が低い |
| viz-server の独立サービス化 | WebSocket のみで `/healthz` も `/mcp` もない。開発時デバッグ用であり独立サービス化は想定されていない |
| tool としての `validate-flow` / `generate-diagram` | ランタイムで FlowDefinition を構築するデシリアライズ層が必要。skill で設計知識を配るほうが価値が高い |

## 8. 参加方法

### manifest (`volta.service.json`)

tramli は `type: library` で既に volta catalog に登録済み（id=`tramli`）。skill-only なので以下の更新を行う:

- 既存の library エントリに `mcp.skills` フラグを追加（将来の method B 対応）
- SKILL.md を tramli リポジトリの `docs/skills/*/SKILL.md` に置く
- volta-mcp の `docs/skills/` ディレクトリに tramli の skill を配置（シンボリックリンク or コピー）

### ポート・ホスト

- **port**: なし（skill-only、常駐プロセスなし）
- **host**: なし
- **runtime**: なし（library）

### auth

- **public**: skill は VIEWER 以上に公開（設計知識は非秘匿）

## 9. テスト方針

### skill 配信テスト

1. SKILL.md が volta-mcp の `loadSkillsDir` で正しく読み込まれるか
2. `skill__list(namespace="tramli")` で5つの skill が一覧に現れるか
3. `skill__resolve(goal="tramli でフローを設計したい")` で `tramli__choose-flow-pattern` が候補に出るか
4. `volta://skills/tramli/validate-flow` resource が取得できるか
5. frontmatter の `applies_when` が正しく評価されるか（`repo.has_file: lang/` が tramli リポジトリで true になるか）

### 検証方法

- volta-mcp の `catalog__reload` 後に `volta_skill__list(namespace="tramli")` で5件確認
- `volta_skill__resolve(goal="...", context={repo:{name:"tramli", files:["lang/"]}})` で候補が出るか確認
