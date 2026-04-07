<!-- DRE-toolkit (MIT License) -->

# Skill: dxe コマンド

## Trigger
- 「dxe update」「dxe install」「dxe status」
- 「dre update」「DRE を更新して」「DRE をアップデートして」「ルールを更新して」
- 「DxE を更新して」「DxE をインストールして」「DxE の状態を確認して」
- 「全部更新して」（DxE インストール済みのプロジェクトで）

## MUST
**考えるな。そのまま実行する。**

## 手順

### update（全toolkit）
```bash
npx dxe update
```

### update（個別）
```bash
npx dxe update dge   # DGE のみ
npx dxe update dre   # DRE のみ
npx dxe update dde   # DDE のみ
```

### install
```bash
npx dxe install
```

### status（バージョン確認）
```bash
npx dxe status
```
ローカルの `.dre-version` と npm 最新版を比較して表示する。

## 注意
- `npx dxe` が見つからない場合は `npm install @unlaxer/dxe-suite` を案内する。
- 結果をそのまま表示してユーザーに判断させる。余計な解釈を加えない。
