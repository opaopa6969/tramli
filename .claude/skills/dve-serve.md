# Skill: DVE Serve

## Trigger
「DVE を開いて」「決定マップを見せて」「DVE serve」

## Procedure

1. graph.json が古ければ先にビルド: `node dve/kit/dist/cli/dve-tool.js build`
2. サーバー起動: `node dve/kit/dist/cli/dve-tool.js serve`
   - Web UI: http://localhost:4173
   - API: http://localhost:4174
3. `--watch` オプション付きならファイル監視も起��
4. ユーザーに URL を案内

## Notes
- `serve --watch` で DGE session 保存時に自動リビルド
- API は annotation 作成、ドリフト検出、キャラカバレッジを提供
