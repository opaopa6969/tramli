# Skill: DVE Trace

## Trigger
「DD-005 の経緯」「この決定はなぜ？」「因果チェーンを見せて」「trace DD-003」

## Procedure

1. DD 番号を特定（ユーザー入力 or 文脈から推定）
2. `node dve/kit/dist/cli/dve-tool.js trace <DD-id>` を実行
3. 因果チェーンを表示:
   - DD → Gap (severity) → Session (characters, date)
4. 「この文脈で DGE しますか？」と提案

## Notes
- graph.json が必要。なければ先に `dve build` を実行
- DD が見つからない場合は `dve search` で検索を提案
