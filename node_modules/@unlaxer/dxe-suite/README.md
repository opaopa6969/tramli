# DxE-suite

DGE / DDE / DRE toolkit を一括インストール・管理するスイートパッケージ。

```
D*E シリーズ:
  DGE — Design-Gap Extraction       設計の穴を会話劇で発見
  DDE — Document-Deficit Extraction ドキュメントの穴をLLM+CLIで発見
  DRE — Document Rule Engine        rules/skills/agentsをパッケージ化
```

## インストール

```bash
npm install @unlaxer/dxe-suite
```

## 使い方

```bash
# 全部インストール
npx dxe install

# 使いたいものだけ
npx dxe install dge
npx dxe install dde dre

# まとめてアップデート
npx dxe update

# インストール済みバージョン確認
npx dxe status
```

## 各 toolkit の詳細

- [DGE-toolkit](../DGE-toolkit/README.md) — 会話劇で設計の穴を抽出
- [DDE-toolkit](../DDE-toolkit/README.md) — ドキュメントの穴をLLM+CLIで補完
- [DRE-toolkit](../DRE-toolkit/README.md) — Claude Code の rules/skills/agents を配布・管理
