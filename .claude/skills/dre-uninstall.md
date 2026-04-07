<!-- DRE-toolkit (MIT License) -->

# Skill: DRE アンインストール

## Trigger
- 「DRE をアンインストールして」
- 「dre-uninstall」
- 「DRE を削除して」
- 「DRE を初期状態に戻して」

## 概要
DRE が `.claude/` に置いたファイルを削除し、FRESH 状態に戻す。
**DRE が管理するファイルのみ削除する。** ユーザーが独自に追加したファイルは触らない。

ステート遷移: `INSTALLED / CUSTOMIZED / OUTDATED → FRESH`

## MUST
1. **実行前に必ずユーザーの確認を取る。** 削除操作のため。
2. **全ファイルをバックアップしてから削除する。**
3. **DRE が置いたファイル以外は削除しない。** ユーザー独自ファイルを巻き込まない。

## 手順

### Step 1: インストール状態の確認
`.claude/.dre-version` を確認:
- 存在しない → 「DRE はインストールされていません」と表示して終了。
- 存在する → バージョンと manifest を読む。

### Step 2: 削除対象の一覧表示
`.claude/.dre-manifest` から DRE が管理するファイル一覧を取得して表示:
```
削除対象ファイル:
  .claude/rules/dre-rules.md
  .claude/skills/dre-update.md
  .claude/skills/dre-reset.md
  .claude/skills/dre-uninstall.md
  .claude/.dre-version
  .claude/.dre-manifest

カスタマイズ済みファイル（削除されますが内容は保持されます）:
  .claude/skills/dge-session.md  ← カスタマイズ済み
```

`.dre-manifest` がない場合（v0.1.x 以前）:
`.claude/` 配下のファイルを `node_modules/@unlaxer/dre-toolkit/` と比較し、DRE由来と判断できるものを列挙。確認をより慎重に取る。

### Step 3: 確認
```
上記ファイルを削除します。
全ファイルは .claude/.dre-backup/<timestamp>/ に退避されます。

実行しますか？ [y/N]
```

### Step 4: バックアップ
```bash
mkdir -p .claude/.dre-backup/<timestamp>
cp -r .claude/rules   .claude/.dre-backup/<timestamp>/
cp -r .claude/skills  .claude/.dre-backup/<timestamp>/
cp -r .claude/agents  .claude/.dre-backup/<timestamp>/
cp -r .claude/commands .claude/.dre-backup/<timestamp>/
cp -r .claude/profiles .claude/.dre-backup/<timestamp>/
cp .claude/.dre-version .claude/.dre-backup/<timestamp>/
cp .claude/.dre-manifest .claude/.dre-backup/<timestamp>/ 2>/dev/null || true
```

### Step 5: 削除実行
manifest のファイルリストを使って DRE 管理ファイルのみ削除:
```bash
# manifest の各エントリを削除
rm -f .claude/.dre-version
rm -f .claude/.dre-manifest
# manifest に記載されたファイルを削除
```

空になったディレクトリは残しておく（`.claude/` 自体は削除しない）。

### Step 6: 完了報告
```
アンインストール完了。DRE ファイルを削除しました。
バックアップ: .claude/.dre-backup/<timestamp>/

再インストールするには:
  npx dre-install
  または
  npx dxe install dre

バックアップから復元するには:
  cp -r .claude/.dre-backup/<timestamp>/* .claude/
```

## 注意
- `.dre-backup/` はユーザーが手動で削除するまで残る。
- `.claude/` ディレクトリ自体は削除しない（他のツールのファイルが入っている可能性があるため）。
