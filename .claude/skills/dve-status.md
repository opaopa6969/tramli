# Skill: DVE Status

## Trigger
「DVE ステータス」「プロジェクトの状態は」「今どのフェーズ？」

## Procedure

1. `node dve/kit/dist/cli/dve-tool.js status` を実行
2. 表示内容:
   - DRE install 状態 (FRESH / INSTALLED / CUSTOMIZED / OUTDATED)
   - Workflow state machine (backlog → spec → {gap_extraction} → impl → review → release)
   - 現在フェーズ + サブステート
   - インストール済み plugin 一覧
3. 複数プ���ジェクト対応: `dve.config.json` があれば全プロジェクトを表示

## Notes
- 現在フェーズの検出優先度: .dre/context.json > CLAUDE.md active_phase > git log 推定
- サブステートは plugin の内部 SM (e.g. DGE: flow_detection → dialogue_generation → ...)
