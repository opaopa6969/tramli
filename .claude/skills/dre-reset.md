<!-- DRE-toolkit (MIT License) -->

# Skill: DRE ファイルリセット

## Trigger
- 「DRE をリセットして」
- 「dre-reset」
- 「カスタマイズを元に戻して」
- 「kit の標準に戻して」
- 「`<ファイル名>` をリセットして」

## 概要
DRE が管理するファイルをカスタマイズ前の状態（kit 標準）に戻す。
**ファイル単位**で動作する。全体リセットは `dre-uninstall` を参照。

## MUST
1. **実行前に必ずユーザーの確認を取る。** カスタマイズを失う操作のため。
2. **バックアップを取ってからリセットする。** `.claude/.dre-backup/<timestamp>/` に退避。
3. **対象ファイルを指定しないまま全体リセットしない。** 1ファイルずつ確認。

## 手順

### Step 1: 対象ファイルの特定
ユーザーが指定した場合はそのファイル。指定なしの場合は以下を表示して選ばせる:

`.claude/.dre-manifest` を読んでカスタマイズ済みファイルを一覧表示:
```
カスタマイズ済みファイル:
  1. rules/my-rule.md
  2. skills/dge-session.md
どのファイルをリセットしますか？（番号または all）
```

`.dre-manifest` がない場合（v0.1.x 以前）: `.claude/` 配下のファイルを `node_modules/@unlaxer/dre-toolkit/` の対応ファイルと diff して一覧を作る。

### Step 2: diff の表示
対象ファイルの現在の状態と kit 標準の差分を表示する:
```bash
diff .claude/<path> node_modules/@unlaxer/dre-toolkit/<path>
```
差分がない場合は「このファイルはカスタマイズされていません」と表示して終了。

### Step 3: 確認
```
.claude/<path> を kit 標準に戻します。
カスタマイズは .claude/.dre-backup/<timestamp>/<path> に退避されます。

実行しますか？ [y/N]
```

### Step 4: バックアップ
```bash
mkdir -p .claude/.dre-backup/<timestamp>/$(dirname <path>)
cp .claude/<path> .claude/.dre-backup/<timestamp>/<path>
```
`<timestamp>` は `date +%Y%m%d-%H%M%S` 形式。

### Step 5: リセット実行
```bash
cp node_modules/@unlaxer/dre-toolkit/<path> .claude/<path>
```

### Step 6: manifest 更新（.dre-manifest がある場合）
対象ファイルのエントリを kit 標準のハッシュに更新する。

### Step 7: 完了報告
```
リセット完了: .claude/<path>
バックアップ: .claude/.dre-backup/<timestamp>/<path>

復元するには:
  cp .claude/.dre-backup/<timestamp>/<path> .claude/<path>
```

## 注意
- `node_modules/@unlaxer/dre-toolkit/` がない場合は `npm install @unlaxer/dre-toolkit` を案内する。
- `.dre-backup/` はユーザーが手動で削除するまで残る。
