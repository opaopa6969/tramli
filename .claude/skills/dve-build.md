# Skill: DVE Build

## Trigger
「DVE ビルド」「決定マップを更新」「graph を更新」

## Procedure

1. kit をコンパイル: `npx tsc -p dve/kit/tsconfig.json`
2. graph.json を生成: `node dve/kit/dist/cli/dve-tool.js build`
3. app をビルド: `cd dve/app && npx vite build`
4. 結果を報告（sessions / gaps / decisions / specs / annotations の件数）

## Notes
- graph.json に session/DD の全文 (content) が含まれる
- changelog.json で前回ビルドとの差分を表示
