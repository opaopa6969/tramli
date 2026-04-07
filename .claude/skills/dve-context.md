# Skill: DVE Context (DGE 再起動)

## Trigger
「DD-003 の経緯で DGE」「この決定を再検討」「制約を追加して DGE」

## Procedure

1. 対象ノード (DD or Gap) を特定
2. `node dve/kit/dist/cli/dve-tool.js context <id> [--constraint="..."]` を実行
3. ContextBundle (JSON) が `dve/contexts/` に保存される
4. prompt_template が表示される — これを DGE に渡す
5. そのまま DGE セッションを開始する（prompt_template をコンテキストとして使用）

## ContextBundle の中身
- origin: 起点ノード
- summary: テーマ、前回の DD 一覧、Gap 一覧、キャラ
- new_constraints: ユーザーが追加した制約
- prompt_template: DGE に渡すテキスト（自動生成）

## Notes
- DVE → DGE の橋渡し。疎結合（プロンプトテキストだけが接点）
- DGE の Phase 0 が context: パスを検出して自動読み込み
