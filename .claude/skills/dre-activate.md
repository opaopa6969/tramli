<!-- DRE-toolkit (MIT License) -->

# Skill: dre スキル有効化・無効化

## Trigger
- 「dre activate <スキル名>」「dre deactivate <スキル名>」
- 「スキルを無効化して」「スキルを有効化して」
- 「dre skills」「インストール済みのスキルを見せて」

## 概要
`.claude/skills/` のスキルを有効（active）/ 無効（disabled）に切り替える。
無効化 = `skills/disabled/` に移動。有効化 = `skills/` に戻す。
ファイルが存在しないスキルは Claude が読まないため、確実に非アクティブになる。

## MUST
1. **削除しない。** `skills/disabled/` に移動するだけ。
2. **dre-activate.md 自身は無効化できない。** 操作不能になるため。

## 手順

### dre skills（一覧表示）
```bash
echo "=== active ===" && ls .claude/skills/*.md 2>/dev/null | xargs -I{} basename {}
echo "=== disabled ===" && ls .claude/skills/disabled/*.md 2>/dev/null | xargs -I{} basename {} || echo "(なし)"
```

### dre deactivate <スキル名>
```bash
mkdir -p .claude/skills/disabled
mv .claude/skills/<スキル名>.md .claude/skills/disabled/<スキル名>.md
echo "無効化: <スキル名>.md → skills/disabled/"
```

### dre activate <スキル名>
```bash
mv .claude/skills/disabled/<スキル名>.md .claude/skills/<スキル名>.md
echo "有効化: <スキル名>.md → skills/"
```

### 一括無効化（minimal セット以外）
minimal セット（常時必要）:
- `dxe-command.md`
- `dre-activate.md`

それ以外を無効化する場合:
```bash
mkdir -p .claude/skills/disabled
for f in .claude/skills/*.md; do
  name=$(basename "$f")
  case "$name" in
    dxe-command.md|dre-activate.md) ;;  # 保護
    *) mv "$f" ".claude/skills/disabled/$name" ;;
  esac
done
```

## 注意
- `dxe update` 実行時、`disabled/` のファイルも更新される（有効化したとき最新版が使われる）。
- スキル名はファイル名から `.md` を除いたもの（例: `dre-reset`）。
