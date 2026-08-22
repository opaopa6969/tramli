# tramli MCP 化ステータス — Phase 2

> 更新: 2026-08-22

## 状態: 完了（skill 配信確認済み）

tramli は **skill-only** で MCP 化完了。常駐プロセスなし、5つの SKILL.md を volta-mcp 経由で配信。

## 完了した作業

### 1. 設計 (DESIGN.md)
- `docs/mcp/DESIGN.md` に namespace=tramli, skill-only の設計を文書化

### 2. Skill 実装 (5つ)
- `docs/skills/validate-flow/SKILL.md` — FlowDefinition 8項目検証手順
- `docs/skills/generate-diagram/SKILL.md` — Mermaid 図生成手順
- `docs/skills/analyze-dataflow/SKILL.md` — DataFlowGraph API でデータ依存分析
- `docs/skills/generate-skeleton/SKILL.md` — 3言語 Processor スケルトン生成
- `docs/skills/choose-flow-pattern/SKILL.md` — FlowDefinition vs Pipeline 選択基準

### 3. volta-mcp への配置と配信確認
- volta-mcp リポジトリ（`opaopa6969/volta-mcp`）に SKILL.md をコピーして push
- prod (192.168.1.50) で `git pull` + `systemctl --user restart volta-mcp`
- prod で `skill__list(namespace="tramli")` で5件確認済み:
  - `tramli__analyze-dataflow`
  - `tramli__choose-flow-pattern`
  - `tramli__generate-diagram`
  - `tramli__generate-skeleton`
  - `tramli__validate-flow`
- `skill__resolve(goal="tramli でフローを設計したい")` で3件の tramli skill が候補に出ることを確認

### 4. 協調 (issue-hub)
- #246: [mcp] tramli → volta-gateway: フロー設計知識の skill 配信通知
- #247: [mcp] tramli → tramli-appspec: フロー設計パターン知識の共有
- #248: [mcp] tramli → tramli-rust: Rust skill 内容の整合性確認
- #249: [mcp] tramli → carta: 設計思想対比の skill 内言及通知

### 5. manifest (volta.service.json)
- `volta.service.json` を root に配置（skill-only を明示、`mcp.enabled: false`）
- `volta__svc_add` dry-run は通ったが、confirm せず（理由は下記）

### 6. gateway ルート
- `gateway_routes_diff` を確認: tramli 由来の変更はなし（svc_add を実行していないため）
- 差分に `affect-engine.unlaxer.org` の1件が含まれていたが、これは別の Phase 2 エージェントによるもの

## svc_add を confirm しなかった理由

1. **既存の library エントリを上書きしてしまう**: tramli は既に `type: library` で catalog に登録済み（`source.installed_by: human`）。`svc_add` は `type: source` + `environments.prod`（port 9299, exec_start `/bin/true`）に変えてしまう。プロセスを持たない library にポートと exec_start を付けるのは不適切。

2. **ポートが割当表と違う**: 割当表で tramli は `port=—`（なし）。スキーマの制約で `port >= 1` が必須のため 9299 を仮置きしたが、これは割当表と一致しない。

3. **skill-only には svc_add が不要**: tramli は MCP バックエンドを持たず、SKILL.md は volta-mcp の `docs/skills/` に配置済み。catalog への library 登録も既存のままで十分。

## catalog__backend_status について

tramli は `mcp.enabled: false`（skill-only）のため、`catalog__backend_status` に `tramli` namespace は出ない。これは期待通りの動作。skill はファサード自身（`volta` namespace）の `skill__list` / `skill__resolve` 経由で配信される。

## 未決事項

1. **volta.service.json スキーマの library 対応**: `volta.service.schema.json` で `type: library` のとき `port` / `runtime` / `exec_start` を必須から外すべきか。現在のスキーマは library に不適合。
2. **method B（services.json の mcp.skills）の実装**: SPEC §10 段階4「未」。バックエンドに手を入れずに skill だけ載せたい場合、現在は volta-mcp の `docs/skills/` に直接配置する必要がある。
3. **tramli-rust の API 整合性**: issue #248 で tramli-rust 側に確認を依頼中。返答待ち（暫定仕様で進行中）。
