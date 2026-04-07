# Skill: DVE Annotate

## Trigger
「DD-005 にコメント」「この決定に異議」「drift を記録」「overturn」

## Procedure

1. 対象ノード (DD, Gap, or Session) を特定
2. action を決定:
   - `comment` — 単なるコメント
   - `fork` — ここから DGE 分岐
   - `overturn` — この決定を撤回
   - `constrain` — 制約を追加
   - `drift` — 現実と乖離している
3. `node dve/kit/dist/cli/dve-tool.js annotate <id> --action <type> --body "text"` を実行
4. `dve/annotations/` にファイルが生成される
5. `dve build` でグラフに反映

## Annotation の影響
- `overturn` → DD の枠が赤に、取り消し線
- `drift` → DD の枠が黄・点線
- `constrain` → バッジ付き

## Notes
- Session は immutable。Annotation は別レイヤーで保存
- Web UI からも作成可能（API server 経由）
